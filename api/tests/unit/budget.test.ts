import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    eval: vi.fn(),
    incrbyfloat: vi.fn(),
    expire: vi.fn(),
    mget: vi.fn(),
    get: vi.fn(),
  },
  ValkeyKeys: {
    budgetMonthly: (org: string, p: string) => `budget:monthly:${org}:${p}`,
    budgetDaily: (org: string, d: string) => `budget:daily:${org}:${d}`,
    budgetReservation: (org: string, id: string) => `budget:reservation:${org}:${id}`,
    budgetTeam: (team: string, p: string) => `budget:team:${team}:${p}`,
    budgetUser: (user: string, p: string) => `budget:user:${user}:${p}`,
  },
  checkValkeyHealth: vi.fn().mockResolvedValue(true),
  closeValkey: vi.fn(),
}))

vi.mock('../../src/repositories/budget.js', () => ({
  budgetRepo: {
    findOrgPolicy: vi.fn(),
  },
}))

import { BudgetService } from '../../src/services/budget.js'
import { valkey } from '../../src/clients/valkey.js'
import { budgetRepo } from '../../src/repositories/budget.js'

describe('BudgetService', () => {
  let budget: BudgetService

  beforeEach(() => {
    vi.clearAllMocks()
    budget = new BudgetService()
  })

  it('approves request when within budget', async () => {
    vi.mocked(valkey.eval).mockResolvedValue([1, 'approved', '100000', '500000000'])
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test-id',
      orgId: 'org-1',
      teamId: null,
      userId: null,
      monthlyLimitMicros: '500000000',
      dailyLimitMicros: null,
      alertAt80Pct: true,
      alertAt95Pct: true,
      onExhaustion: 'block',
    })

    const result = await budget.checkAndDeduct({
      orgId: 'org-1',
      reservationId: 'call-1',
      teamId: 'team-1',
      userId: 'user-1',
      estimatedCostMicros: 100_000,
    })

    expect(result.approved).toBe(true)
    expect(result.reason).toBe('approved')
  })

  it('blocks request when budget exceeded', async () => {
    vi.mocked(valkey.eval).mockResolvedValue([0, 'monthly_budget_exceeded', '500000000', '500000000'])
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test-id',
      orgId: 'org-1',
      teamId: null,
      userId: null,
      monthlyLimitMicros: '500000000',
      dailyLimitMicros: null,
      alertAt80Pct: true,
      alertAt95Pct: true,
      onExhaustion: 'block',
    })

    const result = await budget.checkAndDeduct({
      orgId: 'org-1',
      reservationId: 'call-2',
      teamId: 'team-1',
      userId: 'user-1',
      estimatedCostMicros: 100_000,
    })

    expect(result.approved).toBe(false)
    expect(result.reason).toBe('monthly_budget_exceeded')
  })

  it('falls back to warning on valkey error', async () => {
    vi.mocked(valkey.eval).mockRejectedValue(new Error('Valkey timeout'))
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue(null)

    const result = await budget.checkAndDeduct({
      orgId: 'org-1',
      reservationId: 'call-3',
      teamId: 'team-1',
      userId: 'user-1',
      estimatedCostMicros: 100_000,
    })

    expect(result.approved).toBe(false)
    expect(result.reason).toBe('budget_check_unavailable')
  })
})
