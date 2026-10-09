import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { budgetService } from '../services/budget.js'
import { budgetRepo } from '../repositories/budget.js'
import { usageLogRepo } from '../repositories/usage-log.js'
import { z } from 'zod'

const budgetBodySchema = z.object({
  monthly_limit_usd: z.number().finite().positive().max(1_000_000_000),
  daily_limit_usd: z.number().finite().positive().max(1_000_000_000).optional(),
  alert_at_80: z.boolean().optional(),
  alert_at_95: z.boolean().optional(),
  on_exhaustion: z.literal('block').optional(),
}).strict().refine(value => value.daily_limit_usd === undefined || value.daily_limit_usd <= value.monthly_limit_usd, {
  message: 'daily_limit_usd must not exceed monthly_limit_usd',
  path: ['daily_limit_usd'],
})

const daysSchema = z.coerce.number().int().min(1).max(90)

function invalid(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: 'VALIDATION_ERROR', message })
}

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

  fastify.post('/v1/budgets', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const parsed = budgetBodySchema.safeParse(request.body)
    if (!parsed.success) return invalid(reply, parsed.error.issues[0]?.message ?? 'Invalid budget policy')
    const body = parsed.data

    const policy = await budgetRepo.upsert({
      orgId: ctx.orgId,
      monthlyLimitMicros: String(Math.floor(body.monthly_limit_usd * 1_000_000)),
      dailyLimitMicros: body.daily_limit_usd === undefined ? undefined : String(Math.floor(body.daily_limit_usd * 1_000_000)),
      alertAt80Pct: body.alert_at_80,
      alertAt95Pct: body.alert_at_95,
      onExhaustion: body.on_exhaustion ?? 'block',
    })

    return { success: true, policy_id: policy.id }
  })

  fastify.get('/v1/budgets/spend', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const parsedDays = daysSchema.safeParse((request.query as Record<string, string>).days ?? '30')
    if (!parsedDays.success) return invalid(reply, 'days must be an integer between 1 and 90')
    const days = parsedDays.data

    const [timeSeries, modelDist, monthly] = await Promise.all([
      usageLogRepo.getSpendTimeSeries(ctx.orgId, days),
      usageLogRepo.getModelDistribution(ctx.orgId, days),
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
