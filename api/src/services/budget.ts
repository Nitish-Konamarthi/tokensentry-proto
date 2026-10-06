import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { budgetRepo } from '../repositories/budget.js'
import { logger } from '../lib/logger.js'
import type { BudgetResult } from '../types/index.js'

const BUDGET_CHECK_SCRIPT = `
local monthly_key = KEYS[1]
local daily_key = KEYS[2]
local cost = tonumber(ARGV[1])
local monthly_limit = tonumber(ARGV[2])
local daily_limit = tonumber(ARGV[3])

local monthly = tonumber(redis.call('GET', monthly_key) or '0')
local daily = tonumber(redis.call('GET', daily_key) or '0')

if monthly_limit > 0 and monthly + cost > monthly_limit then
  return {0, 'monthly_budget_exceeded', tostring(monthly), tostring(monthly_limit)}
end
if daily_limit > 0 and daily + cost > daily_limit then
  return {0, 'daily_budget_exceeded', tostring(daily), tostring(daily_limit)}
end

redis.call('INCRBYFLOAT', monthly_key, cost)
redis.call('INCRBYFLOAT', daily_key, cost)

local ttl = redis.call('TTL', monthly_key)
if ttl == -1 then
  redis.call('EXPIRE', monthly_key, 2592000)
end
redis.call('EXPIRE', daily_key, 86400)

local new_monthly = monthly + cost
return {1, 'approved', tostring(new_monthly), tostring(monthly_limit)}
`

export class BudgetService {
  async checkAndDeduct(params: {
    orgId: string; teamId: string; userId: string
    estimatedCostMicros: number
  }): Promise<BudgetResult> {
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const today = now.toISOString().split('T')[0]!

    const monthlyKey = ValkeyKeys.budgetMonthly(params.orgId, yyyyMm)
    const dailyKey = ValkeyKeys.budgetDaily(params.orgId, today)

    // Get budget limits from DB
    const policy = await budgetRepo.findOrgPolicy(params.orgId)
    const monthlyLimit = policy ? Math.floor(parseFloat(policy.monthlyLimitMicros)) : 500_000_000
    const dailyLimit = policy?.dailyLimitMicros ? Math.floor(parseFloat(policy.dailyLimitMicros)) : 0

    try {
      const result = await valkey.eval(
        BUDGET_CHECK_SCRIPT, 2,
        monthlyKey, dailyKey,
        params.estimatedCostMicros.toFixed(4),
        monthlyLimit.toFixed(4),
        dailyLimit.toFixed(4),
      ) as [number, string, string, string]

      const [approved, reason, currentSpendStr, limitStr] = result
      const currentSpend = parseFloat(currentSpendStr ?? '0')
      const limit = parseFloat(limitStr ?? '0')
      const utilization = limit > 0 ? currentSpend / limit : 0

      return {
        approved: approved === 1,
        reason,
        current_spend_usd: currentSpend / 1_000_000,
        limit_usd: limit / 1_000_000,
        utilization,
        should_alert_80: utilization >= 0.80 && utilization < 0.81,
        should_alert_95: utilization >= 0.95 && utilization < 0.96,
        fallback_model: undefined,
      }
    } catch (err) {
      logger.error({ err, orgId: params.orgId }, 'Budget check failed — blocking request (fail-closed)')
      return {
        approved: false,
        reason: 'budget_check_unavailable',
        current_spend_usd: 0,
        limit_usd: monthlyLimit / 1_000_000,
        utilization: 0,
        should_alert_80: false,
        should_alert_95: false,
        fallback_model: undefined,
      }
    }
  }

  async recordActualCost(params: {
    orgId: string; teamId?: string; userId?: string
    actualCostMicros: number
  }): Promise<void> {
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const today = now.toISOString().split('T')[0]!

    const monthlyKey = ValkeyKeys.budgetMonthly(params.orgId, yyyyMm)
    const dailyKey = ValkeyKeys.budgetDaily(params.orgId, today)

    try {
      if (params.actualCostMicros !== 0) {
        await valkey.incrbyfloat(monthlyKey, params.actualCostMicros)
        await valkey.expire(monthlyKey, 2592000)
        await valkey.incrbyfloat(dailyKey, params.actualCostMicros)
        await valkey.expire(dailyKey, 86400)
      }
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Cost adjustment failed')
    }
  }

  async getRealtimeSpend(orgId: string): Promise<{ today: number; thisMonth: number }> {
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const today = now.toISOString().split('T')[0]!

    const [monthly, daily] = await valkey.mget(
      ValkeyKeys.budgetMonthly(orgId, yyyyMm),
      ValkeyKeys.budgetDaily(orgId, today),
    )

    return {
      today: parseFloat(daily ?? '0') / 1_000_000,
      thisMonth: parseFloat(monthly ?? '0') / 1_000_000,
    }
  }
}

export const budgetService = new BudgetService()
