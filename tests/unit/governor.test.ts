// tests/unit/governor.test.ts — BudgetGovernor unit tests (§H2)
// Uses real Redis — requires docker compose redis to be running
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Redis from 'ioredis'
import { BudgetGovernor } from '../../src/pillars/governor.js'

// Use real Redis to test atomicity (the whole point of the Lua script)
const testRedis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379')
const governor = new BudgetGovernor()

// Helper to clean up all test budget keys
async function cleanKeys(prefix: string): Promise<void> {
  const keys = await testRedis.keys(`budget:*:${prefix}*`)
  if (keys.length > 0) await testRedis.del(...keys)
}

describe('BudgetGovernor', () => {

  beforeEach(async () => {
    await cleanKeys('test-')
  })

  afterEach(async () => {
    await cleanKeys('test-')
  })

  it('approves a call within budget', async () => {
    const result = await governor.checkAndDeduct({
      orgId:  'test-org-approve',
      teamId: 'test-team-approve',
      userId: 'test-user-approve',
      estimatedCost: 0.50,
      budgets: { user: 100, team: 500, org: 1000 },
    })

    expect(result.approved).toBe(true)
    expect(result.reason).toBe('approved')
    expect(result.current_spend_usd).toBeCloseTo(0.50, 4)
  })

  it('blocks a call that would exceed org budget', async () => {
    // First, exhaust most of the budget
    await governor.checkAndDeduct({
      orgId:  'test-org-block', teamId: 'test-team-block', userId: 'test-user-block',
      estimatedCost: 999.99,
      budgets: { user: 99999, team: 99999, org: 1000 },
    })

    // Now try to spend $1 more
    const result = await governor.checkAndDeduct({
      orgId:  'test-org-block', teamId: 'test-team-block', userId: 'test-user-block',
      estimatedCost: 1.00,
      budgets: { user: 99999, team: 99999, org: 1000 },
    })

    expect(result.approved).toBe(false)
    expect(result.reason).toBe('org_budget_exceeded')
    expect(result.limit_usd).toBe(1000)
  })

  it('blocks when user daily limit exceeded', async () => {
    await governor.checkAndDeduct({
      orgId: 'test-org-user', teamId: 'test-team-user', userId: 'test-user-daily',
      estimatedCost: 9.99,
      budgets: { user: 10, team: 9999, org: 9999 },
    })

    const result = await governor.checkAndDeduct({
      orgId: 'test-org-user', teamId: 'test-team-user', userId: 'test-user-daily',
      estimatedCost: 0.02,
      budgets: { user: 10, team: 9999, org: 9999 },
    })

    expect(result.approved).toBe(false)
    expect(result.reason).toBe('user_budget_exceeded')
  })

  it('sets fallback_model when utilization > 75%', async () => {
    // Spend 80% of budget
    await governor.checkAndDeduct({
      orgId: 'test-org-fb', teamId: 'test-team-fb', userId: 'test-user-fb',
      estimatedCost: 80,
      budgets: { user: 9999, team: 9999, org: 100 },
    })

    const result = await governor.checkAndDeduct({
      orgId: 'test-org-fb', teamId: 'test-team-fb', userId: 'test-user-fb',
      estimatedCost: 1,
      budgets: { user: 9999, team: 9999, org: 100 },
    })

    expect(result.approved).toBe(true)
    expect(result.fallback_model).toBe('claude-haiku-4-5')
  })

  it('is atomic under concurrent load — no budget overrun', async () => {
    const CONCURRENCY = 50
    const COST_PER_CALL = 1.00
    const BUDGET = 10.00

    // 50 concurrent calls, each $1, against a $10 budget → exactly 10 should succeed
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        governor.checkAndDeduct({
          orgId: 'test-org-race', teamId: 'test-team-race', userId: 'test-user-race',
          estimatedCost: COST_PER_CALL,
          budgets: { user: 99999, team: 99999, org: BUDGET },
        })
      )
    )

    const approved = results.filter(r => r.approved).length
    const blocked  = results.filter(r => !r.approved).length

    expect(approved).toBe(10)
    expect(blocked).toBe(40)
  }, 15_000)  // 15s timeout for concurrent Redis test
})
