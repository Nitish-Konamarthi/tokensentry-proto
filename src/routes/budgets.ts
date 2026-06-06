// src/routes/budgets.ts — Budget Policy CRUD (§B3)
// GET/POST/PATCH /v1/budgets — Manage spend limits per org, team, user

import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireApiKey } from '../middleware/auth.js'
import { pg } from '../clients/db.js'
import { budgetGovernor } from '../pillars/governor.js'
import { redis, RedisKeys } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

export async function budgetRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /v1/budgets — current budget status + real-time spend
  fastify.get('/v1/budgets', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext

    const [policy, spend] = await Promise.all([
      getBudgetPolicy(ctx.orgId),
      budgetGovernor.getSpendBreakdown({ orgId: ctx.orgId, teamId: ctx.teamId, userId: ctx.userId }),
    ])

    const orgLimit = policy?.monthly_limit_usd ?? ctx.budgetLimits.org
    const utilization = orgLimit > 0 ? spend.org / orgLimit : 0

    return reply.send({
      org_id: ctx.orgId,
      limits: {
        org_monthly_usd: orgLimit,
        team_monthly_usd: policy?.team_monthly_limit_usd ?? null,
        user_daily_usd: policy?.user_daily_limit_usd ?? null,
      },
      current_spend: {
        org: spend.org,
        team: spend.team,
        user: spend.user,
      },
      utilization,
      alert_thresholds: {
        at_80: policy?.alert_at_80_pct ?? true,
        at_95: policy?.alert_at_95_pct ?? true,
      },
      on_exhaustion: policy?.on_exhaustion ?? 'block',
      downgrade_to_model: policy?.downgrade_to_model ?? 'claude-haiku-4-5',
      reset_at: getMonthResetDate(),
    })
  })

  // POST /v1/budgets — create or update org-level budget policy
  fastify.post('/v1/budgets', {
    preHandler: requireApiKey,
    schema: {
      body: Type.Object({
        monthly_limit_usd:       Type.Number({ minimum: 0 }),
        team_monthly_limit_usd:  Type.Optional(Type.Number({ minimum: 0 })),
        user_daily_limit_usd:    Type.Optional(Type.Number({ minimum: 0 })),
        alert_at_80_pct:         Type.Optional(Type.Boolean()),
        alert_at_95_pct:         Type.Optional(Type.Boolean()),
        on_exhaustion:           Type.Optional(Type.Union([
          Type.Literal('block'),
          Type.Literal('downgrade'),
          Type.Literal('notify_only'),
        ])),
        downgrade_to_model:      Type.Optional(Type.String()),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const body = request.body as {
      monthly_limit_usd: number
      team_monthly_limit_usd?: number
      user_daily_limit_usd?: number
      alert_at_80_pct?: boolean
      alert_at_95_pct?: boolean
      on_exhaustion?: string
      downgrade_to_model?: string
    }

    await pg`
      INSERT INTO budget_policies
        (org_id, monthly_limit_usd, team_monthly_limit_usd, user_daily_limit_usd,
         alert_at_80_pct, alert_at_95_pct, on_exhaustion, downgrade_to_model)
      VALUES (
        ${ctx.orgId},
        ${body.monthly_limit_usd},
        ${body.team_monthly_limit_usd ?? null},
        ${body.user_daily_limit_usd ?? null},
        ${body.alert_at_80_pct ?? true},
        ${body.alert_at_95_pct ?? true},
        ${body.on_exhaustion ?? 'block'},
        ${body.downgrade_to_model ?? 'claude-haiku-4-5'}
      )
      ON CONFLICT (org_id) WHERE team_id IS NULL AND user_id IS NULL
      DO UPDATE SET
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        team_monthly_limit_usd = EXCLUDED.team_monthly_limit_usd,
        user_daily_limit_usd = EXCLUDED.user_daily_limit_usd,
        alert_at_80_pct = EXCLUDED.alert_at_80_pct,
        alert_at_95_pct = EXCLUDED.alert_at_95_pct,
        on_exhaustion = EXCLUDED.on_exhaustion,
        downgrade_to_model = EXCLUDED.downgrade_to_model,
        updated_at = NOW()
    `

    // Invalidate cached budget limits
    await redis.del(RedisKeys.orgConfig(ctx.orgId))

    logger.info({ orgId: ctx.orgId, limit: body.monthly_limit_usd }, 'Budget policy updated')

    return reply.code(201).send({
      org_id: ctx.orgId,
      monthly_limit_usd: body.monthly_limit_usd,
      updated_at: new Date().toISOString(),
    })
  })

  // GET /v1/budgets/teams — per-team spend breakdown
  fastify.get('/v1/budgets/teams', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext

    const rows = await pg<Array<{
      team_id: string; team_name: string
      monthly_limit: number | null; current_spend: number
    }>>`
      SELECT
        t.id AS team_id,
        t.name AS team_name,
        bp.monthly_limit_usd AS monthly_limit,
        0::float AS current_spend
      FROM teams t
      LEFT JOIN budget_policies bp ON bp.team_id = t.id
      WHERE t.org_id = ${ctx.orgId}
      ORDER BY t.name
    `

    // Enrich with real-time Redis spend
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const enriched = await Promise.all(rows.map(async (r) => {
      const spend = parseFloat(
        (await redis.get(RedisKeys.teamBudget(r.team_id, period))) ?? '0'
      )
      return { ...r, current_spend: spend }
    }))

    return reply.send({ teams: enriched })
  })

  // DELETE /v1/budgets/reset — reset spend counters (admin only)
  fastify.delete('/v1/budgets/reset', {
    preHandler: requireApiKey,
    schema: {
      body: Type.Object({
        scope:   Type.Union([Type.Literal('org'), Type.Literal('team'), Type.Literal('user')]),
        confirm: Type.Literal(true),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const body = request.body as { scope: string; confirm: true }

    if (ctx.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin role required' })
    }

    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    if (body.scope === 'org') {
      await redis.del(RedisKeys.orgBudget(ctx.orgId, period))
    } else if (body.scope === 'team') {
      await redis.del(RedisKeys.teamBudget(ctx.teamId, period))
    } else {
      await redis.del(RedisKeys.userBudget(ctx.userId, period))
    }

    return reply.send({ reset: true, scope: body.scope, period })
  })
}

async function getBudgetPolicy(orgId: string): Promise<{
  monthly_limit_usd: number
  team_monthly_limit_usd: number | null
  user_daily_limit_usd: number | null
  alert_at_80_pct: boolean
  alert_at_95_pct: boolean
  on_exhaustion: string
  downgrade_to_model: string
} | null> {
  const rows = await pg<Array<{
    monthly_limit_usd: number
    team_monthly_limit_usd: number | null
    user_daily_limit_usd: number | null
    alert_at_80_pct: boolean
    alert_at_95_pct: boolean
    on_exhaustion: string
    downgrade_to_model: string
  }>>`
    SELECT monthly_limit_usd, team_monthly_limit_usd, user_daily_limit_usd,
           alert_at_80_pct, alert_at_95_pct, on_exhaustion, downgrade_to_model
    FROM budget_policies
    WHERE org_id = ${orgId} AND team_id IS NULL AND user_id IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

function getMonthResetDate(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
}
