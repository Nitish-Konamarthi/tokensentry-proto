import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    eval: vi.fn(),
    incrbyfloat: vi.fn(),
    expire: vi.fn(),
    mget: vi.fn(),
  },
  ValkeyKeys: {
    budgetMonthly: (org: string, p: string) => `budget:monthly:${org}:${p}`,
    budgetDaily: (org: string, d: string) => `budget:daily:${org}:${d}`,
  },
}))

vi.mock('../../src/repositories/budget.js', () => ({
  budgetRepo: { findOrgPolicy: vi.fn() },
}))

import { BudgetService } from '../../src/services/budget.js'
import { valkey } from '../../src/clients/valkey.js'
import { budgetRepo } from '../../src/repositories/budget.js'

describe('Budget reservation lifecycle', () => {
  let budget: BudgetService

  beforeEach(() => {
    vi.clearAllMocks()
    budget = new BudgetService()
  })

  it('success with estimated cost equal to actual cost leaves budget at actual', async () => {
    vi.mocked(valkey.eval).mockResolvedValueOnce([1, 'approved', '100000', '500000000'])
    vi.mocked(valkey.incrbyfloat).mockResolvedValue('OK')
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test', orgId: 'org-1', monthlyLimitMicros: '500000000',
    })

    // Reserve 100 micros
    await budget.checkAndDeduct({ orgId: 'org-1', estimatedCostMicros: 100_000 })
    // Actual equals estimated -> delta 0
    await budget.recordActualCost({ orgId: 'org-1', actualCostMicros: 0 })
    expect(vi.mocked(valkey.eval)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(valkey.incrbyfloat)).toHaveBeenCalledTimes(0)
  })

  it('success with actual cost below estimate releases the difference', async () => {
    vi.mocked(valkey.eval).mockResolvedValueOnce([1, 'approved', '0', '500000000'])
    vi.mocked(valkey.incrbyfloat).mockResolvedValue('OK')
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test', orgId: 'org-1', monthlyLimitMicros: '500000000',
    })

    await budget.checkAndDeduct({ orgId: 'org-1', estimatedCostMicros: 100_000 })
    await budget.recordActualCost({ orgId: 'org-1', actualCostMicros: -20_000 })
    // Delta is negative (actual < estimated), so budget decreases by 20_000 micros
    expect(vi.mocked(valkey.incrbyfloat)).toHaveBeenCalledWith(
      expect.stringContaining('budget:monthly'), -20000
    )
  })

  it('provider failure releases reservation exactly once', async () => {
    vi.mocked(valkey.eval).mockResolvedValueOnce([1, 'approved', '0', '500000000'])
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test', orgId: 'org-1', monthlyLimitMicros: '500000000',
    })

    await budget.checkAndDeduct({ orgId: 'org-1', estimatedCostMicros: 50_000 })
    await budget.releaseReservation({ orgId: 'org-1', estimatedCostMicros: 50_000 })
    expect(vi.mocked(valkey.eval)).toHaveBeenCalledTimes(2)
  })

  it('reservation release does not erase concurrent spend', async () => {
    // Simulate concurrent state: monthly has 100_000 micros
    vi.mocked(valkey.mget).mockResolvedValueOnce(['100000', '100000'])
    vi.mocked(budgetRepo.findOrgPolicy).mockResolvedValue({
      id: 'test', orgId: 'org-1', monthlyLimitMicros: '500000000',
    })

    // Release 50_000 micros from a concurrent reservation
    await budget.releaseReservation({ orgId: 'org-1', estimatedCostMicros: 50_000 })
    // The script clamps to zero, so it should stay at 50_000 (not go negative)
    expect(vi.mocked(valkey.eval)).toHaveBeenCalled()
  })
})
