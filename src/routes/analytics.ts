// src/routes/analytics.ts — Analytics API
import type { FastifyInstance } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { callTokenSentryAI } from '../clients/anthropic.js'
import { clickhouse } from '../clients/clickhouse.js'
import { redis, RedisKeys, TTL } from '../clients/redis.js'
import { createHash } from 'crypto'

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.get('/v1/analytics/spend', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const { period = '30d' } = request.query as { period?: string }

    const cacheKey = RedisKeys.analytics(
      ctx.orgId,
      createHash('md5').update(`spend:${period}`).digest('hex').slice(0, 8)
    )

    const cached = await redis.get(cacheKey)
    if (cached) {
      reply.header('x-cache', 'HIT')
      return reply.send(JSON.parse(cached) as unknown)
    }

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30

    const result = await clickhouse.query({
      query: `
        SELECT toDate(day) AS date, cost_usd, saved_usd, cache_hits,
               total_calls, input_tokens, output_tokens, avg_reduction_pct, avg_duration_ms
        FROM mv_daily_spend
        WHERE org_id = '${ctx.orgId}' AND day >= NOW() - INTERVAL '${days} days'
        ORDER BY day ASC
      `,
      format: 'JSONEachRow',
    })

    const rows = await result.json()
    const data = { period, days_shown: days, daily: rows }

    await redis.setex(cacheKey, TTL.ANALYTICS_SECONDS, JSON.stringify(data))
    reply.header('x-cache', 'MISS')
    return reply.send(data)
  })

  fastify.get('/v1/analytics/models', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const { period = '30d' } = request.query as { period?: string }
    const days = period === '7d' ? 7 : 30

    const result = await clickhouse.query({
      query: `
        SELECT model_used, sum(calls) AS total_calls, sum(cost_usd) AS cost_usd,
               sum(saved_usd) AS saved_usd, sum(input_tokens) AS input_tokens
        FROM mv_model_distribution
        WHERE org_id = '${ctx.orgId}' AND day >= NOW() - INTERVAL '${days} days'
        GROUP BY model_used ORDER BY cost_usd DESC
      `,
      format: 'JSONEachRow',
    })

    return reply.send({ period, models: await result.json() })
  })

  fastify.get('/v1/analytics/waste', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const { time_window = '7d' } = request.query as { time_window?: string }
    const days = time_window === '24h' ? 1 : time_window === '30d' ? 30 : 7

    const result = await clickhouse.query({
      query: `
        SELECT call_id, model_used, input_tokens, output_tokens, cost_usd,
               duration_ms, cache_hit, model_used AS routing_tier_used,
               model_recommended AS recommended_tier, task_complexity
        FROM ai_call_events
        WHERE org_id = '${ctx.orgId}' AND timestamp >= NOW() - INTERVAL '${days} days'
          AND status_code = 200
        ORDER BY timestamp DESC LIMIT 500
      `,
      format: 'JSONEachRow',
    })

    const calls = await result.json() as Record<string, unknown>[]

    const analysis = await callTokenSentryAI(
      'waste_analyzer',
      { time_window, team_id: ctx.teamId, call_batch: calls.slice(0, 100) },
      { orgId: ctx.orgId, teamId: ctx.teamId }
    )

    return reply.send(analysis)
  })

  fastify.get('/v1/analytics/forecast', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const { horizon = '30d' } = request.query as { horizon?: string }

    const result = await clickhouse.query({
      query: `
        SELECT toDate(day) AS date, sum(cost_usd) AS spend_usd, sum(total_calls) AS call_count
        FROM mv_daily_spend
        WHERE org_id = '${ctx.orgId}' AND day >= NOW() - INTERVAL '90 days'
        GROUP BY day ORDER BY day ASC
      `,
      format: 'JSONEachRow',
    })

    const historical = await result.json() as Array<{ date: string; spend_usd: number; call_count: number }>

    const currentMonthSpend = historical
      .filter(d => d.date.startsWith(new Date().toISOString().slice(0, 7)))
      .reduce((sum, d) => sum + Number(d.spend_usd), 0)

    const forecast = await callTokenSentryAI('cost_forecaster', {
      org_id: ctx.orgId, forecast_horizon: horizon, historical_data: historical,
      current_month_spend_usd: currentMonthSpend, monthly_budget_usd: ctx.budgetLimits.org, team_count: 1,
    }, { orgId: ctx.orgId })

    return reply.send(forecast)
  })
}
