// src/routes/spend.ts — Real-time spend endpoints
import type { FastifyInstance } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { analyticsEngine } from '../pillars/analytics.js'
import { budgetGovernor } from '../pillars/governor.js'

export async function spendRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /v1/spend/realtime — Real-time spend from Redis (instant)
  fastify.get('/v1/spend/realtime', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext

    const [realtimeSpend, breakdown] = await Promise.all([
      analyticsEngine.getRealtimeSpend(ctx.orgId),
      budgetGovernor.getSpendBreakdown({
        orgId: ctx.orgId,
        teamId: ctx.teamId,
        userId: ctx.userId,
      }),
    ])

    const monthlyLimit = ctx.budgetLimits.org
    const utilization = monthlyLimit > 0
      ? breakdown.org / monthlyLimit
      : 0

    return reply.send({
      org_id: ctx.orgId,
      today_usd: realtimeSpend.today,
      this_month_usd: realtimeSpend.thisMonth,
      monthly_limit_usd: monthlyLimit,
      utilization,
      budget_remaining_usd: Math.max(0, monthlyLimit - breakdown.org),
      status: utilization < 0.80 ? 'healthy'
            : utilization < 0.95 ? 'warning'
            : 'critical',
      reset_at: getMonthResetDate(),
      _source: 'redis',  // Sub-millisecond from cache
    })
  })
}

function getMonthResetDate(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
}
