import type { FastifyReply } from 'fastify'
import { logger } from '../../lib/logger.js'
import { agentGuardRepo } from '../../repositories/agent-guard.js'
import { budgetService } from '../../services/budget.js'
import { routerService } from '../../services/router.js'
import { UpstreamUnavailableError, providerRouter, type RouteExecutionResult, type RouteAttempt } from '../../services/provider-router.js'
import { analyticsService } from '../../services/analytics.js'
import { agentGuardService } from '../../services/agent-guard.js'
import { orgRepo } from '../../repositories/org.js'
import { ProviderRequestError } from '../../lib/provider-fetch.js'

import type { UpstreamId } from '../../types/index.js'
import { modelCatalogService } from '../../services/model-catalog-service.js'
import { canonicalizeModelId, getModelOwner } from '../../services/canonicalize.js'
import { isUnknownPricing } from '../../services/catalog-pricing.js'
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
      const blocked = await agentGuardService.isBlocked(ctx.agent.sessionId, ctx.organization.id)
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
    const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)

    // Fail closed: reject requests with unknown pricing before budget check
    const descriptor = modelCatalogService.getDescriptor(canonicalRequested)
    if (!descriptor) {
      return { statusCode: 400, body: { error: 'UNSUPPORTED_MODEL', message: 'Requested model is not supported', call_id: ctx.requestId } }
    }
    if (!descriptor.cost || isUnknownPricing(descriptor.cost)) {
      logger.warn({ model: canonicalRequested, orgId: ctx.organization.id }, 'Unknown pricing - rejecting request (fail-closed)')
      void analyticsService.recordCall({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        apiKeyId: ctx.apiKey,
        model: canonicalRequested,
        provider: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        durationMs: Date.now() - ctx.timestamps.receivedAt,
        cacheHit: false,
        streamed: ctx.request.payload.stream ?? false,
        statusCode: 400,
        error: 'UNKNOWN_PRICING',
        callId: ctx.requestId,
      })

      return {
        statusCode: 400,
        body: {
          error: 'UNKNOWN_PRICING',
          message: `Model ${canonicalRequested} has unknown pricing. Cannot execute request without cost estimation.`,
          call_id: ctx.requestId,
        },
      }
    }

    const contextTokens = inputTokens

    // Fetch organization's actual model policy (before budget reserve so routing uses real policy)
    const orgData = await orgRepo.findById(ctx.organization.id)
    const orgPolicy = (orgData?.modelPolicy as { allowed_models?: string[]; max_model_tier?: string }) ?? {
      allowed_models: ['anthropic/claude-haiku-4-5', 'anthropic/claude-sonnet-4-6'],
      max_model_tier: 'high',
    }

    const routeDecision = await routerService.route({
      requestedModel: ctx.request.payload.model,
      contextTokens,
      outputTokens,
      orgPolicy,
      preservePriority: 'cost',
    })

    const approvedModel = routeDecision.approvedModel
    const canonicalFinal = canonicalizeModelId(approvedModel)

    if (!approvedModel || !modelCatalogService.isSupported(canonicalFinal)) {
      const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)
      const requestedModelIsKnown = modelCatalogService.isSupported(canonicalRequested)
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

    const finalDescriptor = modelCatalogService.getDescriptor(canonicalFinal)
    if (!finalDescriptor?.cost || isUnknownPricing(finalDescriptor.cost)) {
      return {
        statusCode: 400,
        body: { error: 'UNKNOWN_PRICING', message: `Model ${canonicalFinal} has unknown pricing.`, call_id: ctx.requestId },
      }
    }

    // Calculate estimate and reserve budget using the FINAL selected model
    const estimatedCostUsd = routerService.estimateCost(inputTokens, outputTokens, canonicalFinal)
    const estimatedCostMicros = Math.ceil(estimatedCostUsd * 1_000_000)

    const budgetCheck = await budgetService.checkAndDeduct({
      orgId: ctx.organization.id,
      reservationId: ctx.requestId,
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
      const unavailable = budgetCheck.reason === 'budget_check_unavailable'
      const statusCode = unavailable ? 503 : 402
      logger.warn({ orgId: ctx.organization.id, reason: budgetCheck.reason }, unavailable ? 'Budget enforcement unavailable; request blocked' : 'Budget exceeded')

      void analyticsService.recordCall({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        apiKeyId: ctx.apiKey,
        model: ctx.request.payload.model,
        provider: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        durationMs: Date.now() - ctx.timestamps.receivedAt,
        cacheHit: false,
        streamed: ctx.request.payload.stream ?? false,
        statusCode,
        error: budgetCheck.reason,
        callId: ctx.requestId,
      })

      return {
        statusCode,
        body: {
          error: unavailable ? 'BUDGET_CHECK_UNAVAILABLE' : 'BUDGET_EXCEEDED',
          message: unavailable
            ? 'Budget enforcement is temporarily unavailable; request was blocked.'
            : `AI budget exceeded. Spend: $${budgetCheck.current_spend_usd.toFixed(4)} / Limit: $${budgetCheck.limit_usd.toFixed(4)}`,
          reason: budgetCheck.reason,
          current_spend_usd: budgetCheck.current_spend_usd,
          limit_usd: budgetCheck.limit_usd,
          call_id: ctx.requestId,
        },
      }
    }

    const finalModel = budgetCheck.fallback_model ?? approvedModel

    const releaseReservation = () => budgetService.releaseReservation({
      orgId: ctx.organization.id,
      reservationId: ctx.requestId,
    })
    const releaseReservationOnError = async <T>(operation: () => T | Promise<T>): Promise<T> => {
      try {
        return await operation()
      } catch (err) {
        await releaseReservation()
        throw err
      }
    }

    const upstreamInfo = await releaseReservationOnError(() => providerRouter.resolveUpstream(finalModel))

    const modelOwner = getModelOwner(finalModel) ?? 'unknown'

    ctx = {
      ...ctx,
      routingDecision: {
        requestedModel: ctx.request.payload.model,
        approvedModel: finalModel,
        overridden: ctx.request.payload.model !== finalModel,
        estimatedCostUsd,
        provider: upstreamInfo.upstreamId,
        upstream: upstreamInfo.upstreamId,
        upstreamModel: upstreamInfo.upstreamModelId,
        modelOwner,
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
        provider: upstreamInfo.upstreamId,
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

    let routeResult: RouteExecutionResult
    try {
      routeResult = await releaseReservationOnError(() => providerRouter.routeWithFallback({
        model: finalModel,
        orgId: ctx.organization.id,
        messages: ctx.request.normalized?.messages ?? ctx.request.payload.messages,
        system: ctx.request.payload.system,
        maxTokens: outputTokens,
        temperature: ctx.request.payload.temperature,
        stream: ctx.request.payload.stream,
      }))

      const providerResponse = routeResult.response
    const finalRoute = routeResult.finalRoute
    const attempts = routeResult.attempts
    const fallbackUsed = routeResult.fallbackUsed
    const fallbackUpstream = routeResult.fallbackUpstream

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

            const streamUsageState: { value: {
              inputTokens: number
              outputTokens: number
              hasInput: boolean
              hasOutput: boolean
            } | null } = { value: null }
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
                      const usage = this.parseStreamingUsage(finalRoute.upstreamId, data)
                      if (usage) {
                        streamUsageState.value = {
                          inputTokens: usage.inputTokens ?? streamUsageState.value?.inputTokens ?? contextTokens,
                          outputTokens: usage.outputTokens ?? streamUsageState.value?.outputTokens ?? 0,
                          hasInput: usage.inputTokens !== undefined || streamUsageState.value?.hasInput === true,
                          hasOutput: usage.outputTokens !== undefined || streamUsageState.value?.hasOutput === true,
                        }
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
                  const usage = this.parseStreamingUsage(finalRoute.upstreamId, data)
                  if (usage) {
                    streamUsageState.value = {
                      inputTokens: usage.inputTokens ?? streamUsageState.value?.inputTokens ?? contextTokens,
                      outputTokens: usage.outputTokens ?? streamUsageState.value?.outputTokens ?? 0,
                      hasInput: usage.inputTokens !== undefined || streamUsageState.value?.hasInput === true,
                      hasOutput: usage.outputTokens !== undefined || streamUsageState.value?.hasOutput === true,
                    }
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
            const streamUsage = streamUsageState.value
            const usageEstimated = !streamUsage || !streamUsage.hasInput || !streamUsage.hasOutput

            let finalInputTokens = contextTokens
            let finalOutputTokens = 0
            let finalCostMicros = estimatedCostMicros

            if (streamUsage && streamUsage.hasInput && streamUsage.hasOutput && streamUsage.inputTokens > 0) {
              finalInputTokens = streamUsage.inputTokens
              finalOutputTokens = streamUsage.outputTokens
              finalCostMicros = Math.ceil(this.calculateProviderCost(finalRoute.upstreamId, finalModel, finalInputTokens, finalOutputTokens) * 1_000_000)

              await budgetService.recordActualCost({
                orgId: ctx.organization.id,
                reservationId: ctx.requestId,
                actualCostMicros: finalCostMicros,
              })
            } else {
              // Without provider usage, preserve the reservation as a
              // conservative charge. A partial stream may already be billable.
              finalInputTokens = streamUsage?.inputTokens || contextTokens
              finalOutputTokens = streamUsage?.outputTokens ?? outputTokens
              await budgetService.recordActualCost({
                orgId: ctx.organization.id,
                reservationId: ctx.requestId,
                actualCostMicros: estimatedCostMicros,
              })
              finalCostMicros = estimatedCostMicros
            }

            const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)
            const modelOwner = getModelOwner(finalModel) ?? 'unknown'
            
            const lastAttempt = attempts[attempts.length - 1]
            void analyticsService.recordCall({
              orgId: ctx.organization.id,
              teamId: ctx.team.id,
              userId: ctx.user.id,
              apiKeyId: ctx.apiKey,
              model: finalModel,
              provider: finalRoute.upstreamId,
              modelOwner,
              canonicalModel: canonicalRequested,
              upstream: finalRoute.upstreamId,
              upstreamModel: finalRoute.upstreamModelId,
              routePriority: finalRoute.priority,
              attemptNumber: lastAttempt?.attemptNumber ?? attempts.length,
              attempts,
              fallbackUsed,
              fallbackUpstream,
              success: !streamError,
              normalizedErrorCategory: streamError ? 'SERVER_ERROR' : undefined,
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
                provider: finalRoute.upstreamId,
                budgetUtilization: budgetCheck.utilization,
                timestamp: Date.now(),
              }, ctx.request.normalized?.messages ?? ctx.request.payload.messages)
            }
          },
        }
      }

      const responseData = await providerResponse.json() as any
      const { content, inputTokens, outputTokens: outTokens } = this.parseProviderResponse(finalRoute.upstreamId, responseData)
      const usageEstimated = inputTokens <= 0
      const actualCostMicros = usageEstimated
        ? estimatedCostMicros
        : Math.ceil(this.calculateProviderCost(finalRoute.upstreamId, finalModel, inputTokens, outTokens) * 1_000_000)

      await budgetService.recordActualCost({
        orgId: ctx.organization.id,
        reservationId: ctx.requestId,
        actualCostMicros,
      })

      if (ctx.agent?.agentId && ctx.agent?.sessionId) {
        await agentGuardService.recordTurn(ctx.agent.sessionId, {
          sessionId: ctx.agent.sessionId,
          agentId: ctx.agent.agentId,
          orgId: ctx.organization.id,
          inputTokens,
          outputTokens: outTokens,
          toolCount: 0,
          provider: finalRoute.upstreamId,
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

      const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)
      const modelOwner = getModelOwner(finalModel) ?? 'unknown'
      
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
      
      const lastAttempt = attempts[attempts.length - 1]
      void analyticsService.recordCall({
        orgId: ctx.organization.id,
        teamId: ctx.team.id,
        userId: ctx.user.id,
        apiKeyId: ctx.apiKey,
        model: finalModel,
        provider: finalRoute.upstreamId,
        modelOwner,
        canonicalModel: canonicalRequested,
        upstream: finalRoute.upstreamId,
        upstreamModel: finalRoute.upstreamModelId,
        routePriority: finalRoute.priority,
        attemptNumber: lastAttempt?.attemptNumber ?? attempts.length,
        attempts,
        fallbackUsed,
        fallbackUpstream,
        success: true,
        inputTokens,
        outputTokens: outTokens,
        costMicros: actualCostMicros,
        durationMs,
        cacheHit: false,
        streamed: false,
        statusCode: 200,
        usageEstimated,
        callId: ctx.requestId,
      })

      void analyticsService.recordRouting({
        orgId: ctx.organization.id,
        callId: ctx.requestId,
        requestedModel: ctx.request.payload.model,
        canonicalModel: canonicalRequested,
        approvedModel: finalModel,
        modelOwner,
        upstream: finalRoute.upstreamId,
        upstreamModel: finalRoute.upstreamModelId,
        routePriority: finalRoute.priority,
        attemptNumber: lastAttempt?.attemptNumber ?? attempts.length,
        attempts,
        fallbackUsed,
        fallbackUpstream,
        success: true,
        overridden: ctx.request.payload.model !== finalModel,
        estimatedCostUsd,
      })

      return {
        statusCode: 200,
        headers: {
          'x-final-model': finalModel,
          'x-cost-usd': (actualCostMicros / 1_000_000).toFixed(6),
          'x-saved-usd': savedUsd.toFixed(6),
        },
        body: responsePayload,
      }
    } catch (providerErr) {
      if ((providerErr as any)?.message?.includes('No credential configured')) {
        await releaseReservation()
        return {
          statusCode: 500,
          body: { error: 'CONFIG_ERROR', message: 'Required upstream is not configured', call_id: ctx.requestId },
        }
      }
      if (ctx.agent?.sessionId) {
        void agentGuardService.incrementErrors(ctx.agent.sessionId, ctx.organization.id)
      }

      const routeAttempts: RouteAttempt[] = (providerErr as any)?.routeAttempts ?? []
      const lastAttempt = routeAttempts[routeAttempts.length - 1]
      const failedUpstream = lastAttempt?.upstream ?? upstreamInfo.upstreamId
      const failedUpstreamModel = lastAttempt?.upstreamModelId ?? upstreamInfo.upstreamModelId
      const failedRoutePriority = lastAttempt?.routePriority ?? 1
      const failedAttemptNumber = lastAttempt?.attemptNumber ?? 1
      const failedErrorCategory = lastAttempt?.errorCategory ?? 'SERVER_ERROR'
      const fallbackUsed = routeAttempts.length > 1
      const fallbackUpstream = fallbackUsed ? failedUpstream : undefined

      if (providerErr instanceof ProviderRequestError) {
        const usageEstimated = ['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK'].includes(providerErr.code)
        if (usageEstimated) {
          await budgetService.recordActualCost({
            orgId: ctx.organization.id,
            reservationId: ctx.requestId,
            actualCostMicros: estimatedCostMicros,
          })
        } else {
          await releaseReservation()
        }

        const healthDegradingCodes = new Set([
          'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK', 'PROVIDER_ERROR'
        ])
        if (healthDegradingCodes.has(providerErr.code)) {
          void providerRouter.markUpstreamError(upstreamInfo.upstreamId)
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

        const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)
        const modelOwner = getModelOwner(finalModel) ?? 'unknown'

        void analyticsService.recordCall({
          orgId: ctx.organization.id,
          teamId: ctx.team.id,
          userId: ctx.user.id,
          apiKeyId: ctx.apiKey,
          model: finalModel,
          provider: failedUpstream,
          modelOwner,
          canonicalModel: canonicalRequested,
          upstream: failedUpstream,
          upstreamModel: failedUpstreamModel,
          routePriority: failedRoutePriority,
          attemptNumber: failedAttemptNumber,
          attempts: routeAttempts,
          fallbackUsed,
          fallbackUpstream,
          success: false,
          normalizedErrorCategory: failedErrorCategory,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: usageEstimated ? estimatedCostMicros : 0,
          durationMs: Date.now() - ctx.timestamps.receivedAt,
          cacheHit: false,
          streamed: ctx.request.payload.stream ?? false,
          statusCode,
          usageEstimated,
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

      if (providerErr instanceof UpstreamUnavailableError) {
        await releaseReservation()

        const canonicalRequested = canonicalizeModelId(ctx.request.payload.model)
        const modelOwner = getModelOwner(finalModel) ?? 'unknown'

        void analyticsService.recordCall({
          orgId: ctx.organization.id,
          teamId: ctx.team.id,
          userId: ctx.user.id,
          apiKeyId: ctx.apiKey,
          model: finalModel,
          provider: failedUpstream,
          modelOwner,
          canonicalModel: canonicalRequested,
          upstream: failedUpstream,
          upstreamModel: failedUpstreamModel,
          routePriority: failedRoutePriority,
          attemptNumber: failedAttemptNumber,
          attempts: routeAttempts,
          fallbackUsed,
          fallbackUpstream,
          success: false,
          normalizedErrorCategory: failedErrorCategory,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: 0,
          durationMs: Date.now() - ctx.timestamps.receivedAt,
          cacheHit: false,
          streamed: ctx.request.payload.stream ?? false,
          statusCode: 502,
          error: 'UPSTREAM_UNAVAILABLE',
          callId: ctx.requestId,
        })

        return {
          statusCode: 502,
          body: {
            error: 'UPSTREAM_UNAVAILABLE',
            message: 'Upstream temporarily unavailable',
            call_id: ctx.requestId,
          },
        }
      }

      throw providerErr
    }
  }

  private parseProviderResponse(upstream: string, data: any): { content: string; inputTokens: number; outputTokens: number } {
    switch (upstream) {
      case 'anthropic-direct':
        return {
          content: data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') ?? '',
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        }
      case 'openai-direct':
      case 'groq-direct':
      case 'openrouter':
        // OpenAI/Groq/OpenRouter return OpenAI-compatible responses
        return {
          content: data.choices?.[0]?.message?.content ?? '',
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        }
      case 'gemini-direct':
        return {
          content: data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '',
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        }
      default:
        return { content: '', inputTokens: 0, outputTokens: 0 }
    }
  }

  private parseStreamingUsage(upstream: string, data: any): { inputTokens?: number; outputTokens?: number } | null {
    switch (upstream) {
      case 'anthropic-direct':
        // Anthropic sends input usage in message_start and output usage in message_delta.
        if (data.type === 'message_start' && data.message?.usage) {
          return { inputTokens: data.message.usage.input_tokens ?? 0 }
        }
        if (data.type === 'message_delta' && data.usage) {
          return { outputTokens: data.usage.output_tokens ?? 0 }
        }
        return null
      case 'openai-direct':
      case 'groq-direct':
      case 'openrouter':
        // OpenAI/Groq/OpenRouter streaming: final chunk has usage in choices[0].delta or usage field
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
      case 'gemini-direct':
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

  private calculateProviderCost(upstream: string, model: string, inputTokens: number, outputTokens: number): number {
    const canonicalModel = canonicalizeModelId(model)
    const descriptor = modelCatalogService.getDescriptor(canonicalModel)
    if (!descriptor || !descriptor.cost) return 0
    // Cost comes from the catalog descriptor
    if (isUnknownPricing(descriptor.cost)) {
      throw new Error(`Cannot calculate cost for model ${canonicalModel}: pricing is unknown`)
    }
    return (inputTokens / 1_000_000) * descriptor.cost.input + (outputTokens / 1_000_000) * descriptor.cost.output
  }
}

export const decisionEngine = new DecisionEngine()
