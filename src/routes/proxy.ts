// src/routes/proxy.ts — POST /v1/proxy/messages — Core product endpoint
// Pipeline: Auth → RateLimit → Budget → SemanticCache → Classify → Optimize → Proxy → Analytics

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireApiKey, type AuthContext } from '../middleware/auth.js'
import { intelligentRouter } from '../pillars/router.js'
import { promptOptimizer } from '../pillars/optimizer.js'
import { budgetGovernor } from '../pillars/governor.js'
import { analyticsEngine } from '../pillars/analytics.js'
import { proxyCustomerCall, calculateCost } from '../clients/anthropic.js'
import { pg } from '../clients/db.js'
import { logger } from '../utils/logger.js'
import { config } from '../utils/config.js'
import { randomUUID } from 'crypto'
import type Anthropic from '@anthropic-ai/sdk'

function estimateTokens(messages: Array<{ content: unknown }>): number {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    return sum + Math.ceil(content.length / 4)
  }, 0)
}

async function getCustomerApiKey(ctx: AuthContext): Promise<string | null> {
  // SECURITY FIX: Do NOT fall back to the platform's ANTHROPIC_API_KEY.
  // If a customer hasn't configured their own key, return null so the caller
  // can return a clear error. Using the platform key would give them free AI
  // access billed to TokenSentry.
  if (!ctx.anthropicKeyRef) return null

  try {
    const rows = await pg<Array<{ decrypted_secret: string }>>`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${ctx.anthropicKeyRef}
    `
    return rows[0]?.decrypted_secret ?? null
  } catch (err) {
    logger.error({ err, orgId: ctx.orgId }, 'Failed to decrypt API key from Vault')
    return null
  }
}

async function fireAlert(type: string, orgId: string, data: Record<string, unknown>): Promise<void> {
  logger.info({ type, orgId, ...data }, `Alert: ${type}`)
}

function getMonthResetDate(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
}

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  // Stricter rate limit on the proxy route (per org key)
  // Overrides the global 200 req/min — enterprise orgs get 500 req/min
  fastify.post('/v1/proxy/messages', {
    preHandler: requireApiKey,
    config: {
      rateLimit: {
        max: config.RATE_LIMIT_PROXY_ORG,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => {
          const auth = request.headers['authorization'] as string
          // Rate limit per API key prefix (16 chars = unique per key)
          return `ratelimit:proxy:${auth?.slice(7, 23) ?? 'anon'}`
        },
        errorResponseBuilder: () => ({
          error: 'RATE_LIMITED',
          message: `Too many proxy requests. Limit: ${config.RATE_LIMIT_PROXY_ORG} req/min per API key.`,
          retry_after: '60 seconds',
        }),
      },
    },
    schema: {
      body: Type.Object({
        model: Type.String(),
        max_tokens: Type.Number({ minimum: 1, maximum: 200000 }),
        messages: Type.Array(Type.Object({
          role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
          content: Type.Union([Type.String(), Type.Array(Type.Any())]),
        })),
        system: Type.Optional(Type.String()),
        stream: Type.Optional(Type.Boolean()),
        temperature: Type.Optional(Type.Number()),
      }),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const callId = randomUUID()
    const startTime = Date.now()
    const body = request.body as {
      model: string; max_tokens: number
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      system?: string; stream?: boolean
    }
    const ctx = request.authContext

    const teamId = (request.headers['x-ts-team-id'] as string) || ctx.teamId
    const userId = (request.headers['x-ts-user-id'] as string) || ctx.userId
    const preservePriority = (
      request.headers['x-ts-preserve-priority'] as 'accuracy' | 'speed' | 'cost'
    ) || 'cost'
    const agentBudgetTokens = parseInt(
      (request.headers['x-ts-agent-budget-tokens'] as string) || '0'
    )
    const isAgentic = agentBudgetTokens > 0

    reply.header('x-ts-call-id', callId)
    reply.header('x-ts-original-model', body.model)

    try {
      // ── Budget check ──────────────────────────────────────
      const contextTokens = estimateTokens(body.messages)
      const estimatedCost = intelligentRouter.estimateCost(contextTokens, body.max_tokens, body.model)

      const budgetCheck = await budgetGovernor.checkAndDeduct({
        orgId: ctx.orgId, teamId, userId,
        estimatedCost, budgets: ctx.budgetLimits,
      })

      if (!budgetCheck.approved) {
        void fireAlert('budget_exceeded', ctx.orgId, {
          reason: budgetCheck.reason,
          currentSpend: budgetCheck.current_spend_usd,
          limit: budgetCheck.limit_usd,
        })

        return reply.code(402).send({
          error: 'BUDGET_EXCEEDED',
          message: `Monthly AI budget exceeded. Spend: $${budgetCheck.current_spend_usd.toFixed(4)} / Limit: $${budgetCheck.limit_usd.toFixed(4)}`,
          reason: budgetCheck.reason,
          current_spend_usd: budgetCheck.current_spend_usd,
          limit_usd: budgetCheck.limit_usd,
          reset_at: getMonthResetDate(),
        })
      }

      if (budgetCheck.should_alert_80) void fireAlert('budget_80', ctx.orgId, { utilization: budgetCheck.utilization })
      if (budgetCheck.should_alert_95) void fireAlert('budget_95', ctx.orgId, { utilization: budgetCheck.utilization })

      // ── Cache + Classification (parallel) ─────────────────
      const lastUserMessage = body.messages.filter(m => m.role === 'user').at(-1)?.content ?? ''

      const [optimization, routing] = await Promise.all([
        promptOptimizer.process({
          prompt: lastUserMessage,
          history: body.messages.slice(0, -1),
          orgId: ctx.orgId,
          preservePriority,
          maxOutputTokens: body.max_tokens,
        }),
        intelligentRouter.route({
          orgId: ctx.orgId, teamId, userId,
          prompt: lastUserMessage,
          contextTokens,
          userTier: ctx.role as 'developer' | 'analyst' | 'agent' | 'admin',
          orgPolicy: ctx.orgPolicy,
          preservePriority,
          requestedModel: body.model,
        }),
      ])

      // ── Cache hit → return immediately ────────────────────
      if (optimization.cacheHit && optimization.cachedResponse) {
        const durationMs = Date.now() - startTime

        reply
          .header('x-ts-approved-model', 'cached')
          .header('x-ts-cache-hit', 'true')
          .header('x-ts-cost-usd', '0.000000')
          .header('x-ts-reduction-pct', '100')

        void budgetGovernor.recordActualCost({ orgId: ctx.orgId, teamId, userId, actualCost: 0, estimatedCost })

        void analyticsEngine.recordCall({
          orgId: ctx.orgId, teamId, userId,
          modelUsed: 'cached', modelRequested: body.model,
          modelRecommended: routing.recommended_model, modelOverridden: false,
          inputTokens: 0, outputTokens: 0,
          costUsd: 0, metaCostUsd: 0, savedCostUsd: estimatedCost,
          cacheHit: true, optimizationApplied: false, reductionPct: 100,
          durationMs, taskComplexity: routing.complexity, preservePriority,
          isAgentic, statusCode: 200,
        })

        return reply.send({
          id: `msg_${callId}`,
          type: 'message', role: 'assistant',
          content: [{ type: 'text', text: optimization.cachedResponse }],
          model: routing.approved_model, stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
          _ts: { cache_hit: true, approved_model: 'cached', original_model: body.model, call_id: callId },
        })
      }

      // ── Choose final model (budget-aware) ─────────────────
      const finalModel = budgetCheck.fallback_model && routing.approved_model !== 'claude-haiku-4-5'
        ? 'claude-haiku-4-5'
        : routing.approved_model

      const optimizedMessages = [
        ...optimization.pruned_history.map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user' as const, content: optimization.optimized_prompt || lastUserMessage },
      ]

      // ── Get customer API key ───────────────────────────────
      const customerApiKey = await getCustomerApiKey(ctx)
      if (!customerApiKey) {
        return reply.code(400).send({
          error: 'NO_API_KEY',
          message: 'No AI provider API key configured. Add one at app.tokensentry.ai/settings',
        })
      }

      reply
        .header('x-ts-approved-model', finalModel)
        .header('x-ts-cache-hit', 'false')
        .header('x-ts-reduction-pct', optimization.reduction_percentage.toFixed(1))

      // ── Streaming ─────────────────────────────────────────
      if (body.stream) {
        reply.raw.setHeader('content-type', 'text/event-stream')
        reply.raw.setHeader('x-accel-buffering', 'no')
        reply.raw.flushHeaders()

        const optimizedSystem = body.system ? (optimization.optimized_prompt || body.system) : undefined

        const stream = await proxyCustomerCall({
          customerApiKey,
          approvedModel: finalModel,
          messages: optimizedMessages as Anthropic.MessageParam[],
          ...(optimizedSystem != null ? { optimizedSystem } : {}),
          maxTokens: body.max_tokens,
          stream: true,
        }) as import('@anthropic-ai/sdk/lib/MessageStream.js').MessageStream

        let totalInputTokens = 0
        let totalOutputTokens = 0

        for await (const chunk of stream) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
          if (chunk.type === 'message_start' && chunk.message.usage) {
            totalInputTokens = chunk.message.usage.input_tokens
          }
          if (chunk.type === 'message_delta' && 'usage' in chunk) {
            totalOutputTokens = (chunk.usage as { output_tokens: number }).output_tokens
          }
        }

        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()

        const actualCost = calculateCost(totalInputTokens, totalOutputTokens, finalModel)
        const savedCost = intelligentRouter.calculateSavings(totalInputTokens, totalOutputTokens, body.model, finalModel)

        void budgetGovernor.recordActualCost({ orgId: ctx.orgId, teamId, userId, actualCost, estimatedCost })
        void analyticsEngine.recordCall({
          orgId: ctx.orgId, teamId, userId,
          modelUsed: finalModel, modelRequested: body.model,
          modelRecommended: routing.recommended_model, modelOverridden: routing.overridden,
          inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
          costUsd: actualCost, metaCostUsd: 0, savedCostUsd: savedCost,
          cacheHit: false, optimizationApplied: optimization.reduction_percentage > 0,
          reductionPct: optimization.reduction_percentage,
          durationMs: Date.now() - startTime,
          taskComplexity: routing.complexity, preservePriority, isAgentic, statusCode: 200,
        })
        return
      }

      // ── Non-streaming ─────────────────────────────────────
      const response = await proxyCustomerCall({
        customerApiKey,
        approvedModel: finalModel,
        messages: optimizedMessages as Anthropic.MessageParam[],
        ...(body.system != null ? { optimizedSystem: body.system } : {}),
        maxTokens: body.max_tokens,
        stream: false,
      }) as Anthropic.Message

      const durationMs = Date.now() - startTime
      const actualCost = calculateCost(response.usage.input_tokens, response.usage.output_tokens, finalModel)
      const savedCost = intelligentRouter.calculateSavings(response.usage.input_tokens, response.usage.output_tokens, body.model, finalModel)

      reply
        .header('x-ts-cost-usd', actualCost.toFixed(6))
        .header('x-ts-tokens-saved', Math.ceil(savedCost / 0.000003).toString())

      void budgetGovernor.recordActualCost({ orgId: ctx.orgId, teamId, userId, actualCost, estimatedCost })
      void analyticsEngine.recordCall({
        orgId: ctx.orgId, teamId, userId,
        modelUsed: finalModel, modelRequested: body.model,
        modelRecommended: routing.recommended_model, modelOverridden: routing.overridden,
        inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
        costUsd: actualCost, metaCostUsd: 0, savedCostUsd: savedCost,
        cacheHit: false, optimizationApplied: optimization.reduction_percentage > 0,
        reductionPct: optimization.reduction_percentage,
        durationMs, taskComplexity: routing.complexity, preservePriority, isAgentic, statusCode: 200,
      })

      // Cache successful response
      const responseText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')

      if (responseText) {
        void promptOptimizer.cacheResponse({
          prompt: lastUserMessage, response: responseText, orgId: ctx.orgId,
          modelUsed: finalModel, inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        })
      }

      return reply.send({
        ...response,
        _ts: {
          call_id: callId, approved_model: finalModel, original_model: body.model,
          cost_usd: actualCost, saved_usd: savedCost, cache_hit: false,
          optimization_applied: optimization.reduction_percentage > 0,
          reduction_pct: optimization.reduction_percentage,
          complexity: routing.complexity, overridden: routing.overridden, duration_ms: durationMs,
        },
      })

    } catch (err) {
      const durationMs = Date.now() - startTime
      const error = err as Error
      logger.error({ callId, orgId: ctx.orgId, err: error.message, durationMs }, 'Proxy request failed')

      void analyticsEngine.recordCall({
        orgId: ctx.orgId, teamId, userId,
        modelUsed: body.model, modelRequested: body.model,
        modelRecommended: body.model, modelOverridden: false,
        inputTokens: 0, outputTokens: 0, costUsd: 0, metaCostUsd: 0, savedCostUsd: 0,
        cacheHit: false, optimizationApplied: false, reductionPct: 0,
        durationMs, taskComplexity: 'unknown', preservePriority: 'cost',
        isAgentic, error: error.message, statusCode: 500,
      })

      return reply.code(502).send({
        error: 'PROXY_ERROR',
        message: 'Failed to forward request to AI provider',
        call_id: callId,
      })
    }
  })
}
