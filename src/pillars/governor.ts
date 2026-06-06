// src/pillars/governor.ts — Pillar 3: Budget Governor
import { redis, RedisKeys } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

const BUDGET_SCRIPT = `
local user_key  = KEYS[1]
local team_key  = KEYS[2]
local org_key   = KEYS[3]
local cost      = tonumber(ARGV[1])
local user_max  = tonumber(ARGV[2])
local team_max  = tonumber(ARGV[3])
local org_max   = tonumber(ARGV[4])

local u = tonumber(redis.call('GET', user_key) or '0')
local t = tonumber(redis.call('GET', team_key) or '0')
local o = tonumber(redis.call('GET', org_key)  or '0')

if user_max > 0 and u + cost > user_max then
  return {0, 'user_budget_exceeded', tostring(u), tostring(user_max)}
end
if team_max > 0 and t + cost > team_max then
  return {0, 'team_budget_exceeded', tostring(t), tostring(team_max)}
end
if org_max > 0 and o + cost > org_max then
  return {0, 'org_budget_exceeded', tostring(o), tostring(org_max)}
end

redis.call('INCRBYFLOAT', user_key, cost)
redis.call('INCRBYFLOAT', team_key, cost)
redis.call('INCRBYFLOAT', org_key,  cost)

local ttl = redis.call('TTL', org_key)
if ttl == -1 then
  local ttl_secs = 86400 + (30 * 86400)
  redis.call('EXPIRE', user_key, ttl_secs)
  redis.call('EXPIRE', team_key, ttl_secs)
  redis.call('EXPIRE', org_key,  ttl_secs)
end

return {1, 'approved', tostring(o + cost), tostring(org_max)}
`

export interface BudgetCheckResult {
  approved: boolean
  reason: string
  current_spend_usd: number
  limit_usd: number
  utilization: number
  should_alert_80: boolean
  should_alert_95: boolean
  fallback_model?: string
}

export interface BudgetLimits {
  user: number
  team: number
  org: number
}

export class BudgetGovernor {
  async checkAndDeduct(params: {
    orgId: string; teamId: string; userId: string
    estimatedCost: number; budgets: BudgetLimits
  }): Promise<BudgetCheckResult> {
    const { orgId, teamId, userId, estimatedCost, budgets } = params

    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const userKey  = RedisKeys.userBudget(userId, period)
    const teamKey  = RedisKeys.teamBudget(teamId, period)
    const orgKey   = RedisKeys.orgBudget(orgId, period)

    try {
      const result = await redis.eval(
        BUDGET_SCRIPT, 3,
        userKey, teamKey, orgKey,
        estimatedCost.toFixed(8), budgets.user.toFixed(8),
        budgets.team.toFixed(8), budgets.org.toFixed(8),
      ) as [number, string, string, string]

      const [approved, reason, currentSpendStr, limitStr] = result
      const currentSpend = parseFloat(currentSpendStr ?? '0')
      const limit = parseFloat(limitStr ?? '0')
      const utilization = limit > 0 ? currentSpend / limit : 0

      const baseResult: Omit<BudgetCheckResult, 'fallback_model'> = {
        approved: approved === 1,
        reason,
        current_spend_usd: currentSpend,
        limit_usd: limit,
        utilization,
        should_alert_80: utilization > 0.80 && utilization < 0.81,
        should_alert_95: utilization > 0.95 && utilization < 0.96,
      }

      if (utilization > 0.75) {
        return { ...baseResult, fallback_model: 'claude-haiku-4-5' }
      }
      return baseResult

    } catch (err) {
      logger.error({ err, orgId }, 'Budget check failed — allowing request')
      return {
        approved: true,
        reason: 'budget_check_error',
        current_spend_usd: 0,
        limit_usd: budgets.org,
        utilization: 0,
        should_alert_80: false,
        should_alert_95: false,
      }
    }
  }

  async recordActualCost(params: {
    orgId: string; teamId: string; userId: string
    actualCost: number; estimatedCost: number
  }): Promise<void> {
    const delta = params.actualCost - params.estimatedCost
    if (Math.abs(delta) < 0.0000001) return

    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const adjustScript = `
      redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
      redis.call('INCRBYFLOAT', KEYS[2], ARGV[1])
      redis.call('INCRBYFLOAT', KEYS[3], ARGV[1])
      return 1
    `

    try {
      await redis.eval(
        adjustScript, 3,
        RedisKeys.userBudget(params.userId, period),
        RedisKeys.teamBudget(params.teamId, period),
        RedisKeys.orgBudget(params.orgId, period),
        delta.toFixed(8),
      )
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Cost adjustment failed')
    }
  }

  async getCurrentSpend(orgId: string): Promise<number> {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const val = await redis.get(RedisKeys.orgBudget(orgId, period))
    return parseFloat(val ?? '0')
  }

  async getSpendBreakdown(params: { orgId: string; teamId: string; userId: string }): Promise<{ org: number; team: number; user: number }> {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [org, team, user] = await redis.mget(
      RedisKeys.orgBudget(params.orgId, period),
      RedisKeys.teamBudget(params.teamId, period),
      RedisKeys.userBudget(params.userId, period),
    )

    return { org: parseFloat(org ?? '0'), team: parseFloat(team ?? '0'), user: parseFloat(user ?? '0') }
  }
}

export const budgetGovernor = new BudgetGovernor()
