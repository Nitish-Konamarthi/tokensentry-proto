import type { FastifyReply } from 'fastify'
import { logger } from '../../lib/logger.js'
import { agentGuardRepo } from '../../repositories/agent-guard.js'
import { budgetService } from '../../services/budget.js'
import { routerService } from '../../services/router.js'
import { ProviderUnavailableError, providerRouter } from '../../services/provider-router.js'
import { analyticsService } from '../../services/analytics.js'
import { agentGuardService } from '../../services/agent-guard.js'
import { orgRepo } from '../../repositories/org.js'
import { getProviderApiKey } from '../../services/provider-credentials.js'
import { ProviderRequestError } from '../../lib/provider-fetch.js'

import { getModelMetadata, isKnownModel } from '../../services/model-metadata.js'
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
        // Ensure PostgreSQL session status reflects blocked state
        void agentGuardRepo.upsertSession({
          orgId: ctx.organization.id,
          agentId: ctx.agent.agentId,
          sessionId: ctx.agent.sessionId,
          turnCount: 0,
          tokensConsumed: 0,
          riskScore: 0,
          action: 'block',
        })

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
        callId: ctx.requestId,
      })

      return {
        statusCode: 402,
        body: {
          error: 'BUDGET_EXCEEDED',
          message: `Monthly AI budget exceeded. Spend: $${budgetCheck.current_spend_usd.toFixed(4)} / Limit: $${budgetCheck.limit_usd.toFixed(4)}`,
          reason: budgetCheck.reason,
          current_spend_usd: budgetCheck.current_spend_usd,
          limit_usd: budgetCheck.limit_usd,
          call_id: ctx.requestId,
        },
      }
    }

    const releaseReservation = () => budgetService.releaseReservation({
      orgId: ctx.organization.id,
      estimatedCostMicros,
    })
    const releaseReservationOnError = async <T>(operation: () => T | Promise<T>): Promise<T> => {
      try {
        return await operation()
      } catch (err) {
        await releaseReservation()
        throw err
      }
    }

    // Fetch organization's actual model policy
    const orgData = await releaseReservationOnError(() => orgRepo.findById(ctx.organization.id))
    const orgPolicy = (orgData?.modelPolicy as { allowed_models?: string[]; max_model_tier?: string }) ?? {
      allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
      max_model_tier: 'sonnet',
    }

    const routeDecision = await releaseReservationOnError(() => routerService.route({
      requestedModel: ctx.request.payload.model,
      contextTokens,
      outputTokens,
      orgPolicy,
      preservePriority: 'cost',
    }))

    const finalModel = budgetCheck.fallback_model ?? routeDecision.approvedModel
    if (!finalModel || !isKnownModel(finalModel)) {
      await releaseReservation()
      const requestedModelIsKnown = isKnownModel(ctx.request.payload.model)
      return {
        statusCode: requestedModelIsKnown ? 403 : 400,
        body: {
          error: requestedModelIsKnown ? 'MODEL_NOT_ALLOWED' : 'UNSUPPORTED_MODEL',
          message: requestedModelIsKnown
            ? 'No permitted model is available for this request'
            : 'Requested model is not supported',
          call_id: ctx.requestId,
        },
      }
    }

    const provider = await releaseReservationOnError(() => providerRouter.resolveProvider(finalModel))

    ctx = {
      ...ctx,
      routingDecision: {
        requestedModel: ctx.request.payload.model,
        approvedModel: finalModel,
        overridden: ctx.request.payload.model !== finalModel,
        estimatedCostUsd,
        provider,
      },
    }

    if (ctx.agent?.agentId && ctx.agent?.sessionId) {
      const { agentId, sessionId } = ctx.agent
      const guardResult = await releaseReservationOnError(() => agentGuardService.evaluate({
        sessionId,
        agentId,
        orgId: ctx.organization.id,
        inputTokens: contextTokens,
        outputTokens,
        toolCount: 0,
        provider,
        budgetUtilization: budgetCheck.utilization,
        timestamp: Date.now(),
      }, ctx.request.payload.messages))

      if (guardResult.blocked) {
        await releaseReservation()
        void agentGuardRepo.recordGuardEvent({
          orgId: ctx.organization.id,
          sessionId: ctx.agent.sessionId,
          agentId: ctx.agent.agentId,
          score: guardResult.score,
          action: 'block',
          factors: guardResult.factors,
          callId: ctx.requestId,
        })

        // Update PostgreSQL session status to terminated
        void agentGuardRepo.upsertSession({
          orgId: ctx.organization.id,
          agentId: ctx.agent.agentId,
          sessionId: ctx.agent.sessionId,
          turnCount: 0,
          tokensConsumed: 0,
          riskScore: guardResult.score,
          action: 'block',
        })

        return {
          statusCode: 429,
          body: {
            error: 'AGENT_BLOCKED',
            message: `Agent blocked by guard: score ${guardResult.score}/100`,
            session_id: ctx.agent.sessionId,
            score: guardResult.score,
            factors: guardResult.factors,
            call_id: ctx.requestId,
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

    const platformKey = await releaseReservationOnError(() => getProviderApiKey(provider, ctx.organization.id))
    if (!platformKey) {
      await releaseReservation()
      return {
        statusCode: 500,
        body: { error: 'CONFIG_ERROR', message: 'Required provider is not configured', call_id: ctx.requestId },
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

            let streamUsage: { inputTokens: number; outputTokens: number } | null = null
            let streamError: Error | null = null

            try {
              const reader = providerResponse.body?.getReader()
              if (!reader) throw new Error('No response body')

              const decoder = new TextDecoder()
              let buffer = ''

              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                buffer += chunk
                reply.raw.write(chunk)

                // Try to parse usage from complete lines in buffer
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                    try {
                      const data = JSON.parse(trimmed.slice(6))
                      const usage = this.parseStreamingUsage(provider, data)
                      if (usage) {
                        streamUsage = usage
                      }
                    } catch {
                      // Ignore parse errors for non-JSON lines
                    }
                  }
                }
              }

              // Check remaining buffer for final usage
              if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(buffer.trim().slice(6))
                  const usage = this.parseStreamingUsage(provider, data)
                  if (usage) {
                    streamUsage = usage
                  }
                } catch {
                  // Ignore
                }
              }
            } catch (err) {
              streamError = err as Error
              logger.error({ err: streamError, callId: ctx.requestId }, 'Stream error during proxy')
            } finally {
              reply.raw.end()
            }

            const durationMs = Date.now() - ctx.timestamps.receivedAt
            const usageEstimated = !streamUsage

            let finalInputTokens = contextTokens
            let finalOutputTokens = 0
            let finalCostMicros = estimatedCostMicros

            if (streamUsage) {
              finalInputTokens = streamUsage.inputTokens
              finalOutputTokens = streamUsage.outputTokens
              finalCostMicros = Math.ceil(this.calculateProviderCost(provider, finalModel, finalInputTokens, finalOutputTokens) * 1_000_000)

              await budgetService.recordActualCost({
                orgId: ctx.organization.id,
                actualCostMicros: finalCostMicros - estimatedCostMicros,
              })
            } else if (streamError) {
              // Stream failed without reliable usage: release estimated reservation
              await budgetService.releaseReservation({
                orgId: ctx.organization.id,
                estimatedCostMicros,
              })
              finalCostMicros = 0
            }

            void analyticsService.recordCall({
              orgId: ctx.organization.id,
              teamId: ctx.team.id,
              userId: ctx.user.id,
              apiKeyId: ctx.apiKey,
              model: finalModel,
              provider,
              inputTokens: finalInputTokens,
              outputTokens: finalOutputTokens,
              costMicros: finalCostMicros,
              durationMs,
              cacheHit: false,
              streamed: true,
              statusCode: streamError ? 502 : 200,
              usageEstimated,
              error: streamError?.message,
              callId: ctx.requestId,
            })

            if (ctx.agent?.agentId && ctx.agent?.sessionId && streamUsage) {
              await agentGuardService.recordTurn(ctx.agent.sessionId, {
                sessionId: ctx.agent.sessionId,
                agentId: ctx.agent.agentId,
                orgId: ctx.organization.id,
                inputTokens: finalInputTokens,
                outputTokens: finalOutputTokens,
                toolCount: 0,
                provider,
                budgetUtilization: budgetCheck.utilization,
                timestamp: Date.now(),
              }, ctx.request.normalized?.messages ?? ctx.request.payload.messages)
            }
          },
        }
      }

      const responseData = await providerResponse.json() as any
      const { content, inputTokens, outputTokens: outTokens } = this.parseProviderResponse(provider, responseData)
      const actualCostMicros = Math.ceil(this.calculateProviderCost(provider, finalModel, inputTokens, outTokens) * 1_000_000)

      await budgetService.recordActualCost({
        orgId: ctx.organization.id,
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
        callId: ctx.requestId,
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

      if (providerErr instanceof ProviderRequestError) {
        await releaseReservation()

        // Only mark provider unhealthy for infrastructure/availability failures
        const healthDegradingCodes = new Set([
          'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK', 'PROVIDER_ERROR'
        ])
        if (healthDegradingCodes.has(providerErr.code)) {
          void providerRouter.markProviderError(provider)
        }

        const statusCodeMap: Record<string, number> = {
          PROVIDER_AUTH: 401,
          PROVIDER_RATE_LIMIT: 429,
          PROVIDER_BAD_REQUEST: 400,
          PROVIDER_UNAVAILABLE: 502,
          PROVIDER_TIMEOUT: 504,
          PROVIDER_NETWORK: 502,
          PROVIDER_ERROR: 502,
        }

        const messageMap: Record<string, string> = {
          PROVIDER_AUTH: 'Provider authentication failed',
          PROVIDER_RATE_LIMIT: 'Provider rate limit exceeded',
          PROVIDER_BAD_REQUEST: 'Provider bad request',
          PROVIDER_UNAVAILABLE: 'Provider temporarily unavailable',
          PROVIDER_TIMEOUT: 'Provider request timed out',
          PROVIDER_NETWORK: 'Provider network error',
          PROVIDER_ERROR: 'Provider error',
        }

        const statusCode = statusCodeMap[providerErr.code] ?? 502
        const message = messageMap[providerErr.code] ?? 'Provider error'

        void analyticsService.recordCall({
          orgId: ctx.organization.id,
          teamId: ctx.team.id,
          userId: ctx.user.id,
          apiKeyId: ctx.apiKey,
          model: finalModel,
          provider,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: 0,
          durationMs: Date.now() - ctx.timestamps.receivedAt,
          cacheHit: false,
          streamed: ctx.request.payload.stream ?? false,
          statusCode,
          error: providerErr.code,
          callId: ctx.requestId,
        })

        return {
          statusCode,
          body: {
            error: providerErr.code,
            message,
            call_id: ctx.requestId,
          },
        }
      }

      if (providerErr instanceof ProviderUnavailableError) {
        await releaseReservation()

        void analyticsService.recordCall({
          orgId: ctx.organization.id,
          teamId: ctx.team.id,
          userId: ctx.user.id,
          apiKeyId: ctx.apiKey,
          model: finalModel,
          provider,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: 0,
          durationMs: Date.now() - ctx.timestamps.receivedAt,
          cacheHit: false,
          streamed: ctx.request.payload.stream ?? false,
          statusCode: 502,
          error: 'PROVIDER_UNAVAILABLE',
          callId: ctx.requestId,
        })

        return {
          statusCode: 502,
          body: {
            error: 'PROVIDER_UNAVAILABLE',
            message: 'Provider temporarily unavailable',
            call_id: ctx.requestId,
          },
        }
      }

      await releaseReservation()

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

  private parseStreamingUsage(provider: string, data: any): { inputTokens: number; outputTokens: number } | null {
    switch (provider) {
      case 'anthropic':
        // Anthropic streaming: final message has type "message_delta" with usage
        if (data.type === 'message_delta' && data.usage) {
          return {
            inputTokens: data.usage.input_tokens ?? 0,
            outputTokens: data.usage.output_tokens ?? 0,
          }
        }
        // Also check for message_stop with usage
        if (data.type === 'message_stop' && data.usage) {
          return {
            inputTokens: data.usage.input_tokens ?? 0,
            outputTokens: data.usage.output_tokens ?? 0,
          }
        }
        return null
      case 'openai':
      case 'groq':
        // OpenAI/Groq streaming: final chunk has usage in choices[0].delta or usage field
        if (data.usage) {
          return {
            inputTokens: data.usage.prompt_tokens ?? 0,
            outputTokens: data.usage.completion_tokens ?? 0,
          }
        }
        // Some versions put usage in the last choice
        if (data.choices?.[0]?.finish_reason && data.usage) {
          return {
            inputTokens: data.usage.prompt_tokens ?? 0,
            outputTokens: data.usage.completion_tokens ?? 0,
          }
        }
        return null
      case 'gemini':
        // Gemini streaming: usageMetadata in the response
        if (data.usageMetadata) {
          return {
            inputTokens: data.usageMetadata.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          }
        }
        return null
      default:
        return null
    }
  }

  private calculateProviderCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const meta = getModelMetadata(model)
    if (!meta || meta.provider !== provider || !meta.cost) return 0
    return (inputTokens / 1_000_000) * meta.cost.input + (outputTokens / 1_000_000) * meta.cost.output
  }
}

export const decisionEngine = new DecisionEngine()
