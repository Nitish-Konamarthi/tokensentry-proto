import { randomUUID } from 'crypto'
import { logger } from '../../lib/logger.js'
import { usageLogRepo } from '../../repositories/usage-log.js'
import { routingLogRepo } from '../../repositories/routing-log.js'
import { valkey, ValkeyKeys } from '../../clients/valkey.js'
import type { AnalyticsDispatchCall, AnalyticsDispatchRouting, AnalyticsDispatcher } from './index.js'

export class PostgresAnalyticsDispatcher implements AnalyticsDispatcher {
  async recordCall(params: AnalyticsDispatchCall): Promise<string> {
    const callId = params.callId ?? randomUUID()

    try {
      await usageLogRepo.insert({
        callId: callId || `unknown-${Date.now()}`,
        orgId: params.requestMetadata.orgId,
        teamId: params.requestMetadata.teamId,
        userId: params.requestMetadata.userId ?? '',
        apiKeyId: params.requestMetadata.apiKeyId ?? '',
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
        inputTokens: Math.max(0, params.inputTokens ?? 0),
        outputTokens: Math.max(0, params.outputTokens ?? 0),
        costMicros: Math.max(0, params.costMicros ?? 0),
        durationMs: Math.max(0, params.durationMs ?? 0),
        cacheHit: !!params.cacheHit,
        streamed: !!params.streamed,
        statusCode: params.statusCode ?? 200,
        error: params.error,
      })

      await this.updateRealtimeCounter(params.requestMetadata.orgId, params.costMicros)
      logger.debug({ callId, orgId: params.requestMetadata.orgId, model: params.model, provider: params.provider, modelOwner: params.modelOwner, canonicalModel: params.canonicalModel, upstream: params.upstream, tokens: params.inputTokens + params.outputTokens, cost: params.costMicros, cacheHit: params.cacheHit }, 'Call recorded')
    } catch (err) {
      logger.error({ err, callId }, 'Failed to record call')
    }

    return callId
  }

  async recordRouting(params: AnalyticsDispatchRouting): Promise<void> {
    try {
      await routingLogRepo.insert({
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
      logger.error({ err }, 'Failed to record routing')
    }
  }

  private async updateRealtimeCounter(orgId: string, costMicros: number): Promise<void> {
    if (costMicros <= 0) return

    const today = new Date().toISOString().split('T')[0]!
    const key = ValkeyKeys.realtimeSpend(orgId, today)

    try {
      await valkey.incrbyfloat(key, costMicros)
      await valkey.expire(key, 86400 * 2)
    } catch (err) {
      logger.warn({ err, orgId }, 'Failed to update realtime counter')
    }
  }
}
