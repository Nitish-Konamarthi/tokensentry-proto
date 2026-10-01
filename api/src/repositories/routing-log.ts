import { db } from '../db/index.js'
import { routingLogs } from '../db/schema.js'

export class RoutingLogRepository {
  async insert(data: {
    orgId: string; callId: string
    requestedModel: string; recommendedModel?: string; approvedModel: string
    complexity?: string; confidence?: number; reasoning?: string
    estimatedCostUsd?: number; overridden?: boolean
  }) {
    const rows = await db.insert(routingLogs).values({
      orgId: data.orgId,
      callId: data.callId,
      requestedModel: data.requestedModel,
      recommendedModel: data.recommendedModel,
      approvedModel: data.approvedModel,
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
