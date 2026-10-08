import { db } from '../db/index.js'
import { routingLogs } from '../db/schema.js'

export class RoutingLogRepository {
  async insert(data: {
    orgId: string; callId: string
    requestedModel: string; canonicalModel?: string; approvedModel: string
    modelOwner?: string; upstream?: string; upstreamModel?: string
    routePriority?: number; attemptNumber?: number; fallbackUpstream?: string
    success?: boolean; normalizedErrorCategory?: string
    complexity?: string; confidence?: number; reasoning?: string
    estimatedCostUsd?: number; overridden?: boolean
  }) {
    const rows = await db.insert(routingLogs).values({
      orgId: data.orgId,
      callId: data.callId,
      requestedModel: data.requestedModel,
      canonicalModel: data.canonicalModel,
      approvedModel: data.approvedModel,
      modelOwner: data.modelOwner,
      upstream: data.upstream,
      upstreamModel: data.upstreamModel,
      routePriority: data.routePriority,
      attemptNumber: data.attemptNumber,
      fallbackUpstream: data.fallbackUpstream,
      success: data.success,
      normalizedErrorCategory: data.normalizedErrorCategory,
      complexity: data.complexity,
      confidence: data.confidence?.toString(),
      reasoning: data.reasoning,
      estimatedCostUsd: data.estimatedCostUsd?.toString(),
      overridden: data.overridden ?? false,
    }).returning()
    return rows[0]!
  }
}

export const routingLogRepo = new RoutingLogRepository()
