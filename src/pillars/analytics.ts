// src/pillars/analytics.ts — Pillar 4: Analytics Engine
// SECURITY FIX: All ClickHouse queries use parameterized variables — no string interpolation
// Full implementation: spend summary, waste analysis, forecasting, dashboard metrics

import { clickhouse, insertCallEvent, type AICallEvent } from '../clients/clickhouse.js'
import { redis, RedisKeys } from '../clients/redis.js'
import { callTokenSentryAI } from '../clients/anthropic.js'
import { logger } from '../utils/logger.js'
import { randomUUID } from 'crypto'

export interface CallEventParams {
  orgId: string
  teamId: string
  userId: string
  modelUsed: string
  modelRequested: string
  modelRecommended: string
  modelOverridden: boolean
  inputTokens: number
  outputTokens: number
  costUsd: number
  metaCostUsd: number
  savedCostUsd: number
  cacheHit: boolean
  optimizationApplied: boolean
  reductionPct: number
  durationMs: number
  taskComplexity: string
  preservePriority: string
  isAgentic: boolean
  agentId?: string
  error?: string
  statusCode: number
}

// ── Allowed values for group_by and window (whitelist approach) ──────────────
const VALID_WINDOWS = new Set(['24h', '7d', '30d'])
const VALID_GROUP_BY = new Set(['team', 'model', 'day'])
const WINDOW_MAP: Record<string, string> = { '24h': '1 DAY', '7d': '7 DAY', '30d': '30 DAY' }

function validateWindow(w: string): '1 DAY' | '7 DAY' | '30 DAY' {
  if (!VALID_WINDOWS.has(w)) throw new Error(`Invalid window: ${w}`)
  return WINDOW_MAP[w] as '1 DAY' | '7 DAY' | '30 DAY'
}

function validateGroupBy(g: string): 'team' | 'model' | 'day' {
  if (!VALID_GROUP_BY.has(g)) throw new Error(`Invalid group_by: ${g}`)
  return g as 'team' | 'model' | 'day'
}

// UUID regex for validating org/team IDs before use in queries
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validateUuid(id: string, label: string): string {
  if (!UUID_RE.test(id)) throw new Error(`Invalid ${label}: must be a UUID`)
  return id
}

export class AnalyticsEngine {

  // ── Record a completed AI proxy call ────────────────────────────────────────
  async recordCall(params: CallEventParams): Promise<string> {
    const callId = randomUUID()

    const event: AICallEvent = {
      call_id:              callId,
      org_id:               params.orgId,
      team_id:              params.teamId,
      user_id:              params.userId,
      model_used:           params.modelUsed,
      model_requested:      params.modelRequested,
      model_recommended:    params.modelRecommended,
      model_overridden:     params.modelOverridden ? 1 : 0,
      input_tokens:         params.inputTokens,
      output_tokens:        params.outputTokens,
      cost_usd:             params.costUsd,
      meta_cost_usd:        params.metaCostUsd,
      saved_cost_usd:       params.savedCostUsd,
      cache_hit:            params.cacheHit ? 1 : 0,
      optimization_applied: params.optimizationApplied ? 1 : 0,
      reduction_pct:        params.reductionPct,
      duration_ms:          params.durationMs,
      task_complexity:      params.taskComplexity,
      preserve_priority:    params.preservePriority,
      is_agentic:           params.isAgentic ? 1 : 0,
      agent_id:             params.agentId ?? null,
      error:                params.error ?? null,
      status_code:          params.statusCode,
      timestamp:            new Date().toISOString(),
    }

    // Insert to ClickHouse (async fire-and-forget — never blocks the proxy)
    void insertCallEvent(event)

    // Update daily Redis counter for real-time spend display
    void this.updateDailyCounter(params.orgId, params.costUsd)

    logger.debug({
      callId,
      orgId: params.orgId,
      model: params.modelUsed,
      tokens: params.inputTokens + params.outputTokens,
      cost: params.costUsd,
      saved: params.savedCostUsd,
      cacheHit: params.cacheHit,
    }, 'Call event recorded')

    return callId
  }

  // ── Spend summary by day / team / model ────────────────────────────────────
  // SECURITY: All dynamic values validated + parameterized — no SQL injection
  async getSpendSummary(
    orgId: string,
    window: '24h' | '7d' | '30d',
    groupBy: 'team' | 'model' | 'day',
    teamId?: string
  ) {
    const validOrgId = validateUuid(orgId, 'orgId')
    const windowClause = validateWindow(window)
    const validGroupBy = validateGroupBy(groupBy)

    // Build the query based on group_by — each branch uses only safe parameterized values
    let query: string
    let queryParams: Record<string, unknown>

    if (validGroupBy === 'day') {
      query = `
        SELECT
          toStartOfDay(timestamp)  AS date,
          sum(cost_usd)            AS cost_usd,
          sum(saved_cost_usd)      AS saved_usd,
          countIf(cache_hit = 1)   AS cache_hits,
          count()                  AS total_calls,
          sum(input_tokens)        AS input_tokens,
          sum(output_tokens)       AS output_tokens,
          avg(duration_ms)         AS avg_duration_ms
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL {windowDays:UInt32} DAY
          ${teamId ? 'AND team_id = {teamId:UUID}' : ''}
        GROUP BY date
        ORDER BY date ASC
      `
      queryParams = {
        orgId: validOrgId,
        windowDays: windowClause === '1 DAY' ? 1 : windowClause === '7 DAY' ? 7 : 30,
        ...(teamId ? { teamId: validateUuid(teamId, 'teamId') } : {}),
      }

    } else if (validGroupBy === 'team') {
      query = `
        SELECT
          team_id,
          sum(cost_usd)       AS cost_usd,
          sum(saved_cost_usd) AS saved_usd,
          count()             AS total_calls,
          countIf(cache_hit=1) AS cache_hits
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL {windowDays:UInt32} DAY
        GROUP BY team_id
        ORDER BY cost_usd DESC
        LIMIT 20
      `
      queryParams = {
        orgId: validOrgId,
        windowDays: windowClause === '1 DAY' ? 1 : windowClause === '7 DAY' ? 7 : 30,
      }

    } else {
      // model
      query = `
        SELECT
          model_used,
          count()             AS call_count,
          sum(cost_usd)       AS cost_usd,
          sum(input_tokens)   AS input_tokens,
          sum(output_tokens)  AS output_tokens,
          avg(duration_ms)    AS avg_duration_ms
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL {windowDays:UInt32} DAY
        GROUP BY model_used
        ORDER BY cost_usd DESC
      `
      queryParams = {
        orgId: validOrgId,
        windowDays: windowClause === '1 DAY' ? 1 : windowClause === '7 DAY' ? 7 : 30,
      }
    }

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    })
    return result.json()
  }

  // ── Dashboard metrics (pre-computed, served from 60s Redis cache) ───────────
  async getDashboardMetrics(orgId: string) {
    const validOrgId = validateUuid(orgId, 'orgId')
    const cacheKey = `dashboard:${validOrgId}:${Math.floor(Date.now() / 60000)}`

    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const result = await clickhouse.query({
      query: `
        SELECT
          sum(cost_usd)                                           AS total_cost_usd,
          sum(saved_cost_usd)                                     AS total_saved_usd,
          countIf(cache_hit = 1) / count()                       AS cache_hit_rate,
          avg(reduction_pct)                                      AS avg_reduction_pct,
          countIf(is_agentic = 1)                                AS agentic_calls,
          countIf(model_used = 'claude-opus-4-6') / count()     AS opus_usage_rate,
          count()                                                 AS total_calls,
          countIf(timestamp > now() - INTERVAL 24 HOUR)         AS calls_24h,
          countIf(cache_hit = 1)                                 AS cache_hits_30d,
          sum(input_tokens + output_tokens)                      AS total_tokens_30d,
          avg(cost_usd)                                          AS avg_cost_per_call
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL 30 DAY
      `,
      query_params: { orgId: validOrgId },
      format: 'JSONEachRow',
    })

    const rows = await result.json<any[]>()
    const metrics = rows[0] ?? {}
    await redis.setex(cacheKey, 60, JSON.stringify(metrics))
    return metrics
  }

  // ── Real-time spend (from Redis — sub-millisecond) ─────────────────────────
  async getRealtimeSpend(orgId: string): Promise<{ today: number; thisMonth: number }> {
    const now = new Date()
    const today = now.toISOString().split('T')[0]!
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [todayVal, monthVal] = await redis.mget(
      RedisKeys.orgDaily(orgId, today),
      RedisKeys.orgBudget(orgId, period)
    )

    return {
      today: parseFloat(todayVal ?? '0'),
      thisMonth: parseFloat(monthVal ?? '0'),
    }
  }

  // ── AI-powered waste analysis ───────────────────────────────────────────────
  async analyzeWaste(orgId: string, teamId: string, window: '24h' | '7d' | '30d') {
    const validOrgId = validateUuid(orgId, 'orgId')
    const windowDays = window === '24h' ? 1 : window === '7d' ? 7 : 30

    const callsResult = await clickhouse.query({
      query: `
        SELECT
          call_id,
          model_used,
          model_recommended,
          input_tokens,
          output_tokens,
          cost_usd,
          task_complexity,
          cache_hit,
          is_agentic,
          model_recommended AS recommended_tier,
          model_used        AS routing_tier_used,
          duration_ms
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL {days:UInt32} DAY
        ORDER BY timestamp DESC
        LIMIT 500
      `,
      query_params: { orgId: validOrgId, days: windowDays },
      format: 'JSONEachRow',
    })

    const calls = await callsResult.json<any[]>()

    return callTokenSentryAI(
      'waste_analyzer',
      {
        time_window: window,
        team_id: teamId,
        call_batch: calls.slice(0, 200), // Cap at 200 for prompt size
      },
      { orgId }
    )
  }

  // ── Cost forecast ───────────────────────────────────────────────────────────
  async generateForecast(orgId: string, horizon: '30d' | '90d' | '180d') {
    const validOrgId = validateUuid(orgId, 'orgId')

    const historicalResult = await clickhouse.query({
      query: `
        SELECT
          toDate(timestamp)   AS date,
          sum(cost_usd)       AS spend_usd,
          count()             AS call_count
        FROM ai_call_events
        WHERE org_id = {orgId:UUID}
          AND timestamp > now() - INTERVAL 90 DAY
        GROUP BY date
        ORDER BY date ASC
      `,
      query_params: { orgId: validOrgId },
      format: 'JSONEachRow',
    })

    const historical = await historicalResult.json<any[]>()

    // Get current month spend from Redis (always accurate)
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentSpend = parseFloat((await redis.get(RedisKeys.orgBudget(validOrgId, period))) ?? '0')

    return callTokenSentryAI(
      'cost_forecaster',
      {
        org_id: validOrgId,
        forecast_horizon: horizon,
        historical_data: historical,
        current_month_spend_usd: currentSpend,
        monthly_budget_usd: 500, // TODO: fetch from budget_policies table
        team_count: 1,
      },
      { orgId }
    )
  }

  // ── Daily Redis counter (for real-time dashboard) ──────────────────────────
  private async updateDailyCounter(orgId: string, cost: number): Promise<void> {
    if (cost <= 0) return

    const today = new Date().toISOString().split('T')[0]!
    const key = RedisKeys.orgDaily(orgId, today)

    try {
      await redis.incrbyfloat(key, cost)
      await redis.expire(key, 86400 * 2)  // Keep 2 days of daily counters
    } catch (err) {
      logger.warn({ err, orgId }, 'Failed to update daily counter')
    }
  }
}

export const analyticsEngine = new AnalyticsEngine()
