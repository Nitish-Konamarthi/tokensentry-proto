import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { budgetRepo } from '../repositories/budget.js'
import { logger } from '../lib/logger.js'
import type { BudgetResult } from '../types/index.js'

// V1 Budget Enforcement: Organization-level only.
// Team/user-level budget enforcement is not implemented in V1.
// The teamId/userId parameters are accepted for API compatibility but not used.

const BUDGET_RELEASE_SCRIPT = `
local reservation = redis.call('GET', KEYS[1])
if not reservation then return {0, 'already_reconciled'} end
local data = cjson.decode(reservation)
local cost = tonumber(data.cost)
if redis.call('EXISTS', data.monthly_key) == 1 then redis.call('INCRBYFLOAT', data.monthly_key, -cost) end
if redis.call('EXISTS', data.daily_key) == 1 then redis.call('INCRBYFLOAT', data.daily_key, -cost) end
redis.call('DEL', KEYS[1])
return {1, 'released'}
`

const BUDGET_RESERVE_SCRIPT = `
local reservation_key = KEYS[3]
if redis.call('EXISTS', reservation_key) == 1 then
  return {0, 'duplicate_reservation', '0', ARGV[2]}
end
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
if redis.call('TTL', monthly_key) == -1 then redis.call('EXPIRE', monthly_key, 2678400) end
if redis.call('TTL', daily_key) == -1 then redis.call('EXPIRE', daily_key, 172800) end
redis.call('SET', reservation_key, cjson.encode({monthly_key=monthly_key, daily_key=daily_key, cost=cost}), 'EX', 172800)
return {1, 'approved', tostring(monthly + cost), tostring(monthly_limit)}
`

const BUDGET_RECONCILE_SCRIPT = `
local reservation = redis.call('GET', KEYS[1])
if not reservation then return {0, 'already_reconciled'} end
local data = cjson.decode(reservation)
local delta = tonumber(ARGV[1]) - tonumber(data.cost)
if delta ~= 0 then
  if redis.call('EXISTS', data.monthly_key) == 1 then redis.call('INCRBYFLOAT', data.monthly_key, delta) end
  if redis.call('EXISTS', data.daily_key) == 1 then redis.call('INCRBYFLOAT', data.daily_key, delta) end
end
redis.call('DEL', KEYS[1])
return {1, 'reconciled'}
`

function budgetPeriods(date = new Date()): { month: string; day: string } {
  return {
    month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    day: date.toISOString().slice(0, 10),
  }
}

export class BudgetService {
  async checkAndDeduct(params: {
    orgId: string
    reservationId: string
    estimatedCostMicros: number
  }): Promise<BudgetResult> {
    if (!params.reservationId || !Number.isFinite(params.estimatedCostMicros) || params.estimatedCostMicros < 0) {
      return {
        approved: false,
        reason: 'invalid_budget_reservation',
        current_spend_usd: 0,
        limit_usd: 0,
        utilization: 0,
        should_alert_80: false,
        should_alert_95: false,
      }
    }
    const { month, day } = budgetPeriods()

    const monthlyKey = ValkeyKeys.budgetMonthly(params.orgId, month)
    const dailyKey = ValkeyKeys.budgetDaily(params.orgId, day)
    const reservationKey = ValkeyKeys.budgetReservation(params.orgId, params.reservationId)

    // Get budget limits from DB (org-level only in V1)
    const policy = await budgetRepo.findOrgPolicy(params.orgId)
    const monthlyLimit = policy ? Math.floor(parseFloat(policy.monthlyLimitMicros)) : 500_000_000
    const dailyLimit = policy?.dailyLimitMicros ? Math.floor(parseFloat(policy.dailyLimitMicros)) : 0

    try {
      const result = await valkey.eval(
        BUDGET_RESERVE_SCRIPT, 3,
        monthlyKey, dailyKey, reservationKey,
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

  async releaseReservation(params: {
    orgId: string
    reservationId: string
  }): Promise<void> {
    try {
      await valkey.eval(
        BUDGET_RELEASE_SCRIPT, 1,
        ValkeyKeys.budgetReservation(params.orgId, params.reservationId),
      )
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Budget reservation release failed')
    }
  }

  async recordActualCost(params: {
    orgId: string
    reservationId: string
    actualCostMicros: number
  }): Promise<void> {
    if (!params.reservationId || !Number.isFinite(params.actualCostMicros) || params.actualCostMicros < 0) {
      logger.error({ orgId: params.orgId }, 'Invalid budget reconciliation input')
      return
    }
    try {
      await valkey.eval(
        BUDGET_RECONCILE_SCRIPT, 1,
        ValkeyKeys.budgetReservation(params.orgId, params.reservationId),
        params.actualCostMicros.toFixed(4),
      )
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Cost adjustment failed')
    }
  }

  async getRealtimeSpend(orgId: string): Promise<{ today: number; thisMonth: number }> {
    const { month, day } = budgetPeriods()

    const [monthly, daily] = await valkey.mget(
      ValkeyKeys.budgetMonthly(orgId, month),
      ValkeyKeys.budgetDaily(orgId, day),
    )

    return {
      today: parseFloat(daily ?? '0') / 1_000_000,
      thisMonth: parseFloat(monthly ?? '0') / 1_000_000,
    }
  }
}

export const budgetService = new BudgetService()
