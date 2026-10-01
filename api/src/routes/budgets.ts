import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { budgetService } from '../services/budget.js'
import { budgetRepo } from '../repositories/budget.js'
import { usageLogRepo } from '../repositories/usage-log.js'

export async function budgetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/budgets', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const policy = await budgetRepo.findOrgPolicy(ctx.orgId)
    const realtime = await budgetService.getRealtimeSpend(ctx.orgId)

    return {
      policy: policy ? {
        id: policy.id,
        monthly_limit_usd: parseFloat(policy.monthlyLimitMicros) / 1_000_000,
        daily_limit_usd: policy.dailyLimitMicros ? parseFloat(policy.dailyLimitMicros) / 1_000_000 : null,
        alert_at_80: policy.alertAt80Pct,
        alert_at_95: policy.alertAt95Pct,
        on_exhaustion: policy.onExhaustion,
      } : null,
      current: {
        today_usd: realtime.today,
        this_month_usd: realtime.thisMonth,
        utilization_pct: policy
          ? (realtime.thisMonth / (parseFloat(policy.monthlyLimitMicros) / 1_000_000)) * 100
          : 0,
      },
    }
  })

  fastify.post('/v1/budgets', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as {
      monthly_limit_usd: number
      daily_limit_usd?: number
      alert_at_80?: boolean
      alert_at_95?: boolean
      on_exhaustion?: string
    }

    const policy = await budgetRepo.upsert({
      orgId: ctx.orgId,
      monthlyLimitMicros: String(Math.floor(body.monthly_limit_usd * 1_000_000)),
      dailyLimitMicros: body.daily_limit_usd ? String(Math.floor(body.daily_limit_usd * 1_000_000)) : undefined,
      alertAt80Pct: body.alert_at_80,
      alertAt95Pct: body.alert_at_95,
      onExhaustion: body.on_exhaustion,
    })

    return { success: true, policy_id: policy.id }
  })

  fastify.get('/v1/budgets/spend', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const days = parseInt((request.query as Record<string, string>).days ?? '30', 10)

    const [timeSeries, modelDist, monthly] = await Promise.all([
      usageLogRepo.getSpendTimeSeries(ctx.orgId, Math.min(days, 90)),
      usageLogRepo.getModelDistribution(ctx.orgId, Math.min(days, 90)),
      usageLogRepo.getOrgMonthlySpend(ctx.orgId),
    ])

    return {
      time_series: timeSeries.map(r => ({
        date: r.date,
        spend_usd: (r.spend ?? 0) / 1_000_000,
        calls: r.calls ?? 0,
      })),
      model_distribution: modelDist.map(r => ({
        model: r.model,
        calls: r.calls ?? 0,
        cost_usd: (r.costMicros ?? 0) / 1_000_000,
      })),
      current_month_total_usd: monthly / 1_000_000,
    }
  })
}
