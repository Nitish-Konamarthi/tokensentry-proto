import { db } from '../db/index.js'
import { usageLogs } from '../db/schema.js'
import { eq, and, gte, lt, sql, desc } from 'drizzle-orm'

export class UsageLogRepository {
  async insert(data: {
    orgId: string; teamId: string; userId?: string; apiKeyId?: string
    callId: string; model: string; provider: string
    modelOwner?: string; canonicalModel?: string; upstream?: string; upstreamModel?: string
    routePriority?: number; attemptNumber?: number; fallbackUpstream?: string
    success?: boolean; normalizedErrorCategory?: string
    inputTokens: number; outputTokens: number; costMicros: number
    durationMs: number; cacheHit: boolean; streamed: boolean
    statusCode: number; error?: string
  }) {
    const rows = await db.insert(usageLogs).values(data).returning()
    return rows[0]!
  }

  async batchInsert(rows: Array<typeof usageLogs.$inferInsert>) {
    if (rows.length === 0) return
    await db.insert(usageLogs).values(rows)
  }

  async getOrgMonthlySpend(orgId: string) {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

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
    since.setDate(since.getDate() - days)

    const result = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        spend: sql<number>`SUM(cost_micros)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(usageLogs)
      .where(and(
        eq(usageLogs.orgId, orgId),
        gte(usageLogs.createdAt, since),
      ))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`)

    return result
  }

  async getModelDistribution(orgId: string, days: number) {
    const since = new Date()
    since.setDate(since.getDate() - days)

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
