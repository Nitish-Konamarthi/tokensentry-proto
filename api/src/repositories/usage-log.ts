import { db } from '../db/index.js'
import { usageLogs } from '../db/schema.js'
import { eq, and, gte, lt, sql, desc } from 'drizzle-orm'
import type { RouteAttempt } from '../services/provider-router.js'

export class UsageLogRepository {
  async insert(data: {
    orgId: string; teamId: string | null; userId?: string | null; apiKeyId?: string | null
    callId: string; model: string; provider: string
    modelOwner?: string; canonicalModel?: string; upstream?: string; upstreamModel?: string
    routePriority?: number; attemptNumber?: number
    attempts?: RouteAttempt[]
    fallbackUsed?: boolean
    fallbackUpstream?: string
    success?: boolean; normalizedErrorCategory?: string
    inputTokens: number; outputTokens: number; costMicros: number
    durationMs: number; cacheHit: boolean; streamed: boolean
    statusCode: number; error?: string
    usageEstimated?: boolean
  }) {
    const rows = await db.insert(usageLogs).values({
      ...data,
      attempts: data.attempts ? JSON.stringify(data.attempts) : undefined,
      usageEstimated: data.usageEstimated ?? false,
    }).returning()
    return rows[0]!
  }

  async batchInsert(rows: Array<typeof usageLogs.$inferInsert>) {
    if (rows.length === 0) return
    await db.insert(usageLogs).values(rows)
  }

  async getOrgMonthlySpend(orgId: string) {
    const now = new Date()
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(cost_micros), 0)` })
      .from(usageLogs)
      .where(and(
        eq(usageLogs.orgId, orgId),
        gte(usageLogs.createdAt, startOfMonth),
      ))

    return result[0]?.total ?? 0
  }

  async getDailySpend(orgId: string) {
    const now = new Date()
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(cost_micros), 0)` })
      .from(usageLogs)
      .where(and(
        eq(usageLogs.orgId, orgId),
        gte(usageLogs.createdAt, startOfDay),
      ))

    return result[0]?.total ?? 0
  }

  async getSpendTimeSeries(orgId: string, days: number) {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - days)

    const result = await db
      .select({
      date: sql<string>`(created_at AT TIME ZONE 'UTC')::date`,
        spend: sql<number>`SUM(cost_micros)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(usageLogs)
      .where(and(
        eq(usageLogs.orgId, orgId),
        gte(usageLogs.createdAt, since),
      ))
      .groupBy(sql`(created_at AT TIME ZONE 'UTC')::date`)
      .orderBy(sql`(created_at AT TIME ZONE 'UTC')::date`)

    return result
  }

  async getModelDistribution(orgId: string, days: number) {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - days)

    return db
      .select({
        model: usageLogs.model,
        calls: sql<number>`COUNT(*)`,
        costMicros: sql<number>`SUM(cost_micros)`,
      })
      .from(usageLogs)
      .where(and(
        eq(usageLogs.orgId, orgId),
        gte(usageLogs.createdAt, since),
      ))
      .groupBy(usageLogs.model)
      .orderBy(desc(sql`SUM(cost_micros)`))
  }
}

export const usageLogRepo = new UsageLogRepository()
