import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { analyticsService } from '../services/analytics.js'
import { usageLogRepo } from '../repositories/usage-log.js'
import { z } from 'zod'

const daysSchema = z.coerce.number().int().min(1).max(90)

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/analytics/spend', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const parsedDays = daysSchema.safeParse((request.query as Record<string, string>).days ?? '30')
    if (!parsedDays.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'days must be an integer between 1 and 90' })
    const days = parsedDays.data
    const realtime = await analyticsService.getRealtimeSpend(ctx.orgId)
    const timeSeries = await usageLogRepo.getSpendTimeSeries(ctx.orgId, days)

    return {
      realtime: {
        today_usd: realtime.today,
        this_month_usd: realtime.thisMonth,
      },
      time_series: timeSeries.map(r => ({
        date: r.date,
        spend_usd: (r.spend ?? 0) / 1_000_000,
        calls: r.calls ?? 0,
      })),
    }
  })

  fastify.get('/v1/analytics/models', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const parsedDays = daysSchema.safeParse((request.query as Record<string, string>).days ?? '30')
    if (!parsedDays.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'days must be an integer between 1 and 90' })
    const distribution = await usageLogRepo.getModelDistribution(ctx.orgId, parsedDays.data)

    const totalCost = distribution.reduce((sum, r) => sum + (r.costMicros ?? 0), 0)

    return distribution.map(r => ({
      model: r.model,
      calls: r.calls ?? 0,
      cost_usd: (r.costMicros ?? 0) / 1_000_000,
      pct: totalCost > 0 ? ((r.costMicros ?? 0) / totalCost) * 100 : 0,
    }))
  })
}
