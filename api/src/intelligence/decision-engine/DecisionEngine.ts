import type { FastifyReply } from 'fastify'
import { logger } from '../../lib/logger.js'
import { apiKeyRepo } from '../../repositories/api-key.js'
import { agentGuardRepo } from '../../repositories/agent-guard.js'
import { budgetService } from '../../services/budget.js'
import { routerService } from '../../services/router.js'
import { providerRouter } from '../../services/provider-router.js'
import { analyticsService } from '../../services/analytics.js'
import { agentGuardService } from '../../services/agent-guard.js'

import { env } from '../../config/env.js'
import {
  computeRequestHash,
  estimateTokenCount,
  normalizeRequestPayload,
} from '../analyzer/index.js'
import type { DecisionResult } from './DecisionResult.js'
import type { RequestContext } from '../request-context.js'

export class DecisionEngine {
  async decide(context: RequestContext): Promise<DecisionResult> {
    const normalized = normalizeRequestPayload({
      model: context.request.payload.model,
      system: context.request.payload.system,
      messages: context.request.payload.messages,
      maxTokens: context.request.payload.max_tokens ?? undefined,
      temperature: context.request.payload.temperature ?? undefined,
    })

    const requestHash = computeRequestHash({
      model: normalized.model,
      system: normalized.system,
      messages: normalized.messages,
      maxTokens: normalized.maxTokens,
      temperature: normalized.temperature,
    })
    let ctx: RequestContext = {
      ...context,
      request: {
        ...context.request,
        normalized,
        hash: requestHash,
      },
      timestamps: {
        ...context.timestamps,
      },
    }

    if (ctx.agent?.agentId && ctx.agent?.sessionId) {
      const blocked = await agentGuardService.isBlocked(ctx.agent.sessionId)
      if (blocked) {
        return {
          statusCode: 429,
          body: {
            error: 'AGENT_BLOCKED',
            message: 'Agent session has been blocked due to anomalous behavior',
            session_id: ctx.agent.sessionId,
            retry_after_seconds: 120,
          },
        }
      }
    }

    const inputTokens = estimateTokenCount(normalized.messages)
    const outputTokens = ctx.request.payload.max_tokens ?? 1024
    const estimatedCostUsd = routerService.estimateCost(inputTokens, outputTokens, ctx.request.payload.model)
    const estimatedCostMicros = Math.ceil(estimatedCostUsd * 1_000_000)
    const contextTokens = inputTokens

    const budgetCheck = await budgetService.checkAndDeduct({
      orgId: ctx.organization.id,
      teamId: ctx.team.id,
      userId: ctx.user.id,
      estimatedCostMicros,
    })

    ctx = {
      ...ctx,
      budgetState: {
        approved: budgetCheck.approved,
        reason: budgetCheck.reason,
        currentSpendUsd: budgetCheck.current_spend_usd,
        limitUsd: budgetCheck.limit_usd,
        utilization: budgetCheck.utilization,
        fallbackModel: budgetCheck.fallback_model,
      },
      timestamps: {
        ...ctx.timestamps,
        budgetCheckedAt: Date.now(),
      },
    }

    if (!budgetCheck.approved) {
      logger.warn({ orgId: ctx.organization.id, reason: budgetCheck.reason }, 'Budget exceeded')

      void analyticsService.recordCall({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        apiKeyId: ctx.apiKey,
        model: ctx.request.payload.model,
        provider: 'anthropic',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        durationMs: Date.now() - ctx.timestamps.receivedAt,
        cacheHit: false,
        streamed: ctx.request.payload.stream ?? false,
        statusCode: 402,
        error: budgetCheck.reason,
      })

      return {
        statusCode: 402,
        body: {
          error: 'BUDGET_EXCEEDED',
          message: `Monthly AI budget exceeded. Spend: $${budgetCheck.current_spend_usd.toFixed(4)} / Limit: $${budgetCheck.limit_usd.toFixed(4)}`,
          reason: budgetCheck.reason,
          current_spend_usd: budgetCheck.current_spend_usd,
          limit_usd: budgetCheck.limit_usd,
        },
      }
    }

    const routeDecision = await routerService.route({
      requestedModel: ctx.request.payload.model,
      contextTokens,
      outputTokens,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'], max_model_tier: 'sonnet' },
      preservePriority: 'cost',
    })

    const finalModel = budgetCheck.fallback_model ?? routeDecision.approvedModel
    const provider = providerRouter.resolveProvider(finalModel)
    const providerHealth = await providerRouter.checkProviderHealth(provider)

    ctx = {
      ...ctx,
      providerHealth,
      routingDecision: {
        requestedModel: ctx.request.payload.model,
        approvedModel: finalModel,
        overridden: ctx.request.payload.model !== finalModel,
        estimatedCostUsd,
        provider,
      },
    }

    if (ctx.agent?.agentId && ctx.agent?.sessionId) {
      const guardResult = await agentGuardService.evaluate({
        sessionId: ctx.agent.sessionId,
        agentId: ctx.agent.agentId,
        orgId: ctx.organization.id,
        inputTokens: contextTokens,
        outputTokens,
        toolCount: 0,
        provider,
        budgetUtilization: budgetCheck.utilization,
        timestamp: Date.now(),
      }, ctx.request.payload.messages)

      if (guardResult.blocked) {
        void agentGuardRepo.recordGuardEvent({
          orgId: ctx.organization.id,
          sessionId: ctx.agent.sessionId,
          agentId: ctx.agent.agentId,
          score: guardResult.score,
          action: 'block',
          factors: guardResult.factors,
          callId: ctx.requestId,
        })

        return {
          statusCode: 429,
          body: {
            error: 'AGENT_BLOCKED',
            message: `Agent blocked by guard: score ${guardResult.score}/100`,
            session_id: ctx.agent.sessionId,
            score: guardResult.score,
            factors: guardResult.factors,
          },
        }
      }

      if (guardResult.action === 'warn') {
        void agentGuardRepo.recordGuardEvent({
          orgId: ctx.organization.id,
          sessionId: ctx.agent.sessionId,
          agentId: ctx.agent.agentId,
          score: guardResult.score,
          action: 'warn',
          factors: guardResult.factors,
          callId: ctx.requestId,
        })
      }
    }

    await apiKeyRepo.findByOrg(ctx.organization.id)
    const platformKey = process.env['ANTHROPIC_API_KEY']
    if (!platformKey) {
      return {
        statusCode: 500,
        body: { error: 'CONFIG_ERROR', message: 'No AI provider API key configured' },
      }
    }

    try {
      const providerResponse = await providerRouter.route({
        provider,
        model: finalModel,
        apiKey: platformKey,
        messages: ctx.request.normalized?.messages ?? ctx.request.payload.messages,
        system: ctx.request.payload.system,
        maxTokens: outputTokens,
        temperature: ctx.request.payload.temperature,
        stream: ctx.request.payload.stream,
      })

      const durationMs = Date.now() - ctx.timestamps.receivedAt
      ctx = {
        ...ctx,
        timestamps: {
          ...ctx.timestamps,
          providerResponseAt: Date.now(),
        },
      }

      if (ctx.request.payload.stream) {
        return {
          statusCode: 200,
          streamHandler: async (reply: FastifyReply) => {
            reply.raw.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'x-call-id': ctx.requestId,
              'x-final-model': finalModel,
            })

            try {
              const reader = providerResponse.body?.getReader()
              if (!reader) throw new Error('No response body')

              const decoder = new TextDecoder()
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                reply.raw.write(decoder.decode(value))
              }
            } catch (streamErr) {
              logger.error({ err: streamErr, callId: ctx.requestId }, 'Stream error during proxy')
            } finally {
              reply.raw.end()
            }

            void analyticsService.recordCall({
              orgId: ctx.organization.id,
              teamId: ctx.team.id,
              userId: ctx.user.id,
              apiKeyId: ctx.apiKey,
              model: finalModel,
              provider,
              inputTokens: contextTokens,
              outputTokens: 0,
              costMicros: estimatedCostMicros,
              durationMs,
              cacheHit: false,
              streamed: true,
              statusCode: 200,
            })
          },
        }
      }

      const responseData = await providerResponse.json() as any
      const { content, inputTokens, outputTokens: outTokens } = this.parseProviderResponse(provider, responseData)
      const actualCostMicros = provider === 'anthropic'
        ? Math.ceil(this.calculateAnthropicCost(finalModel, inputTokens, outTokens) * 1_000_000)
        : estimatedCostMicros

      await budgetService.recordActualCost({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        actualCostMicros: actualCostMicros - estimatedCostMicros,
      })

      if (ctx.agent?.agentId && ctx.agent?.sessionId) {
        await agentGuardService.recordTurn(ctx.agent.sessionId, {
          sessionId: ctx.agent.sessionId,
          agentId: ctx.agent.agentId,
          orgId: ctx.organization.id,
          inputTokens,
          outputTokens: outTokens,
          toolCount: 0,
          provider,
          budgetUtilization: budgetCheck.utilization,
          timestamp: Date.now(),
        }, ctx.request.normalized?.messages ?? ctx.request.payload.messages)
      }

      const savedUsd = routerService.calculateSavings(inputTokens, outTokens, ctx.request.payload.model, finalModel)
      const responsePayload = {
        id: `call_${ctx.requestId}`,
        model: finalModel,
        choices: [{
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outTokens,
          total_tokens: inputTokens + outTokens,
        },
        _ts: {
          call_id: ctx.requestId,
          cost_usd: actualCostMicros / 1_000_000,
          saved_usd: savedUsd,
          cache_hit: false,
        },
      }

      ctx = {
        ...ctx,
        analyticsMetadata: {
          cacheHit: false,
          streamed: false,
          statusCode: 200,
          costMicros: actualCostMicros,
          inputTokens,
          outputTokens: outTokens,
        },
        timestamps: {
          ...ctx.timestamps,
          decisionCompletedAt: Date.now(),
        },
      }

      void analyticsService.recordCall({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        apiKeyId: ctx.apiKey,
        model: finalModel,
        provider,
        inputTokens,
        outputTokens: outTokens,
        costMicros: actualCostMicros,
        durationMs,
        cacheHit: false,
        streamed: false,
        statusCode: 200,
      })

      void analyticsService.recordRouting({
        orgId: ctx.organization.id,
        callId: ctx.requestId,
        requestedModel: ctx.request.payload.model,
        approvedModel: finalModel,
        overridden: ctx.request.payload.model !== finalModel,
        estimatedCostUsd,
      })

      return {
        statusCode: 200,
        headers: {
          'x-final-model': finalModel,
          'x-cost-usd': actualCostMicros.toFixed(6),
          'x-saved-usd': savedUsd.toFixed(6),
        },
        body: responsePayload,
      }
    } catch (providerErr) {
      if (ctx.agent?.sessionId) {
        void agentGuardService.incrementErrors(ctx.agent.sessionId)
      }

      void providerRouter.markProviderError(provider)
      throw providerErr
    }
  }

  private parseProviderResponse(provider: string, data: any): { content: string; inputTokens: number; outputTokens: number } {
    switch (provider) {
      case 'anthropic':
        return {
          content: data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') ?? '',
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        }
      case 'openai':
      case 'groq':
        return {
          content: data.choices?.[0]?.message?.content ?? '',
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        }
      case 'gemini':
        return {
          content: data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '',
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        }
      default:
        return { content: '', inputTokens: 0, outputTokens: 0 }
    }
  }

  private calculateAnthropicCost(model: string, inputTokens: number, outputTokens: number): number {
    const costs: Record<string, { input: number; output: number }> = {
      'claude-haiku-4-5': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'claude-opus-4-6': { input: 15.00, output: 75.00 },
    }

    const c = costs[model]
    if (!c) return 0
    return (inputTokens / 1_000_000) * c.input + (outputTokens / 1_000_000) * c.output
  }
}

export const decisionEngine = new DecisionEngine()
