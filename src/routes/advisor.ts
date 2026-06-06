// src/routes/advisor.ts — Budget Advisor AI Q&A
import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireApiKey } from '../middleware/auth.js'
import { callTokenSentryAI } from '../clients/anthropic.js'
import { analyticsEngine } from '../pillars/analytics.js'
import { clickhouse } from '../clients/clickhouse.js'

export async function advisorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/advisor/query', {
    preHandler: requireApiKey,
    schema: {
      body: Type.Object({
        question: Type.String({ minLength: 5, maxLength: 1000 }),
        org_name: Type.Optional(Type.String()),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const { question, org_name } = request.body as { question: string; org_name?: string }

    const [realtimeSpend, modelDist] = await Promise.all([
      analyticsEngine.getRealtimeSpend(ctx.orgId),
      getModelDistribution(ctx.orgId),
    ])

    const now = new Date()
    const daysElapsed = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    const answer = await callTokenSentryAI<string>(
      'budget_advisor',
      {
        question,
        org_context: {
          org_name: org_name ?? ctx.orgId,
          monthly_budget_usd: ctx.budgetLimits.org,
          current_month_spend_usd: realtimeSpend.thisMonth,
          days_elapsed_this_month: daysElapsed,
          days_remaining_in_month: daysInMonth - daysElapsed,
          total_saved_usd_this_month: 0,
          team_count: 1,
          top_spending_teams: [],
          model_distribution: modelDist,
          yoy_growth_rate: 0,
          cache_hit_rate: 0,
          plan: ctx.plan,
        },
      },
      { orgId: ctx.orgId }
    )

    return reply.send({
      question, answer, org_id: ctx.orgId,
      generated_at: new Date().toISOString(),
    })
  })
}

async function getModelDistribution(orgId: string): Promise<{ haiku: number; sonnet: number; opus: number }> {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT model_used, sum(calls) AS total
        FROM mv_model_distribution
        WHERE org_id = '${orgId}' AND day >= NOW() - INTERVAL '30 days'
        GROUP BY model_used
      `,
      format: 'JSONEachRow',
    })

    const rows = await result.json() as Array<{ model_used: string; total: number }>
    const total = rows.reduce((s, r) => s + Number(r.total), 0) || 1

    return {
      haiku:  (rows.find(r => r.model_used.includes('haiku'))?.total ?? 0) / total,
      sonnet: (rows.find(r => r.model_used.includes('sonnet'))?.total ?? 0) / total,
      opus:   (rows.find(r => r.model_used.includes('opus'))?.total ?? 0) / total,
    }
  } catch {
    return { haiku: 0.7, sonnet: 0.28, opus: 0.02 }
  }
}
