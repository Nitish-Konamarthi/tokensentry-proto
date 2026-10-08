import { budgetService } from './budget.js'
import { logger } from '../lib/logger.js'
import type { AnalyticsDispatcher, AnalyticsDispatchCall, AnalyticsDispatchRouting, AnalyticsRequestMetadata } from '../analytics/dispatcher/index.js'
import { analyticsDispatcher } from '../analytics/dispatcher/index.js'

export interface CallRecord {
  orgId: string; teamId: string; userId?: string; apiKeyId?: string
  model: string; provider: string
  modelOwner?: string; canonicalModel?: string
  upstream?: string; upstreamModel?: string
  routePriority?: number; attemptNumber?: number
  fallbackUpstream?: string; success?: boolean
  normalizedErrorCategory?: string
  durationMs: number; inputTokens: number; outputTokens: number; costMicros: number
  cacheHit: boolean; streamed: boolean
  statusCode: number; error?: string
  usageEstimated?: boolean
  callId?: string
}

export class AnalyticsService {
  private readonly dispatcher: AnalyticsDispatcher

  constructor(dispatcher: AnalyticsDispatcher = analyticsDispatcher) {
    this.dispatcher = dispatcher
  }

  async recordCall(params: CallRecord): Promise<string> {
    const requestMetadata: AnalyticsRequestMetadata = {
      orgId: params.orgId,
      teamId: params.teamId,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
    }

    try {
      const callId = await this.dispatcher.recordCall({
        requestMetadata,
        model: params.model,
        provider: params.provider,
        modelOwner: params.modelOwner,
        canonicalModel: params.canonicalModel,
        upstream: params.upstream,
        upstreamModel: params.upstreamModel,
        routePriority: params.routePriority,
        attemptNumber: params.attemptNumber,
        fallbackUpstream: params.fallbackUpstream,
        success: params.success,
        normalizedErrorCategory: params.normalizedErrorCategory,
        durationMs: params.durationMs,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costMicros: params.costMicros,
        cacheHit: params.cacheHit,
        streamed: params.streamed,
        statusCode: params.statusCode,
        error: params.error,
        usageEstimated: params.usageEstimated,
        callId: params.callId,
      })

      return callId
    } catch (err) {
      const callId = params.callId ?? ''
      logger.error({ err, callId }, 'Failed to dispatch call analytics')
      return callId
    }
  }

  async recordRouting(params: {
    orgId: string; callId: string
    requestedModel: string; canonicalModel?: string; approvedModel: string
    modelOwner?: string; upstream?: string; upstreamModel?: string
    routePriority?: number; attemptNumber?: number; fallbackUpstream?: string
    success?: boolean; normalizedErrorCategory?: string
    complexity?: string; confidence?: number; reasoning?: string
    estimatedCostUsd?: number; overridden?: boolean
  }): Promise<void> {
    try {
      await this.dispatcher.recordRouting({
        orgId: params.orgId,
        callId: params.callId,
        requestedModel: params.requestedModel,
        canonicalModel: params.canonicalModel,
        approvedModel: params.approvedModel,
        modelOwner: params.modelOwner,
        upstream: params.upstream,
        upstreamModel: params.upstreamModel,
        routePriority: params.routePriority,
        attemptNumber: params.attemptNumber,
        fallbackUpstream: params.fallbackUpstream,
        success: params.success,
        normalizedErrorCategory: params.normalizedErrorCategory,
        complexity: params.complexity,
        confidence: params.confidence,
        reasoning: params.reasoning,
        estimatedCostUsd: params.estimatedCostUsd,
        overridden: params.overridden,
      })
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch routing analytics')
    }
  }

  getRealtimeSpend(orgId: string): Promise<{ today: number; thisMonth: number }> {
    return budgetService.getRealtimeSpend(orgId)
  }
}

export const analyticsService = new AnalyticsService()
