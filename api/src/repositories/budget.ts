import { db } from '../db/index.js'
import { budgets } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'

export interface BudgetRow {
  id: string
  orgId: string
  teamId: string | null
  userId: string | null
  monthlyLimitMicros: string
  dailyLimitMicros: string | null
  alertAt80Pct: boolean | null
  alertAt95Pct: boolean | null
  onExhaustion: string | null
}

export class BudgetRepository {
  async findOrgPolicy(orgId: string): Promise<BudgetRow | null> {
    const rows = await db.select().from(budgets)
      .where(and(
        eq(budgets.orgId, orgId),
        isNull(budgets.teamId),
        isNull(budgets.userId),
      ))
      .limit(1)
    return rows[0] ?? null
  }

  async findTeamPolicy(orgId: string, teamId: string): Promise<BudgetRow | null> {
    const rows = await db.select().from(budgets)
      .where(and(
        eq(budgets.orgId, orgId),
        eq(budgets.teamId, teamId),
        isNull(budgets.userId),
      ))
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(data: {
    orgId: string
    teamId?: string
    userId?: string
    monthlyLimitMicros: string
    dailyLimitMicros?: string
    alertAt80Pct?: boolean
    alertAt95Pct?: boolean
    onExhaustion?: string
  }) {
    const existing = await db.select({ id: budgets.id }).from(budgets)
      .where(and(
        eq(budgets.orgId, data.orgId),
        data.teamId ? eq(budgets.teamId, data.teamId) : isNull(budgets.teamId),
        data.userId ? eq(budgets.userId, data.userId) : isNull(budgets.userId),
      ))
      .limit(1)

    const values: Partial<typeof budgets.$inferInsert> & { updatedAt: Date } = {
      monthlyLimitMicros: data.monthlyLimitMicros,
      dailyLimitMicros: data.dailyLimitMicros ?? null,
      updatedAt: new Date(),
    }
    if (data.alertAt80Pct !== undefined) values.alertAt80Pct = data.alertAt80Pct
    if (data.alertAt95Pct !== undefined) values.alertAt95Pct = data.alertAt95Pct
    if (data.onExhaustion !== undefined) values.onExhaustion = data.onExhaustion

    if (existing[0]) {
      const rows = await db.update(budgets)
        .set(values)
        .where(eq(budgets.id, existing[0].id))
        .returning()
      return rows[0]!
    }

    const rows = await db.insert(budgets).values({ ...data, ...values }).returning()
    return rows[0]!
  }
}

export const budgetRepo = new BudgetRepository()
