import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    eval: vi.fn(), get: vi.fn(), setex: vi.fn(), mget: vi.fn(),
    incrbyfloat: vi.fn(), expire: vi.fn(), hgetall: vi.fn(), hset: vi.fn(),
    hincrby: vi.fn(), zcard: vi.fn(), zremrangebyscore: vi.fn(),
    zrangebyscore: vi.fn(), del: vi.fn(), scan: vi.fn(),
  },
  ValkeyKeys: {
    budgetMonthly: (org: string, period: string) => `budget:monthly:${org}:${period}`,
    budgetDaily: (org: string, day: string) => `budget:daily:${org}:${day}`,
    rateLimit: (key: string, window: number) => `ratelimit:${key}:${window}`,
    agentSession: (session: string) => `agent:session:${session}`,
    agentStats: (session: string) => `agent:stats:${session}`,
    agentBlocked: (session: string) => `agent:blocked:${session}`,
    providerHealth: (provider: string) => `provider:health:${provider}`,
  },
  checkValkeyHealth: vi.fn().mockResolvedValue(true),
  closeValkey: vi.fn(),
}))

vi.mock('../../src/repositories/budget.js', () => ({
  budgetRepo: {
    findOrgPolicy: vi.fn().mockResolvedValue({
      id: 'test-id', orgId: 'org-1', teamId: null, userId: null,
      monthlyLimitMicros: '500000000', dailyLimitMicros: null,
    }),
  },
}))

import { BudgetService } from '../../src/services/budget.js'
import { extractClientIp } from '../../src/lib/ip.js'
import { providerRouter, UpstreamUnavailableError } from '../../src/services/provider-router.js'
import { rateLimiter } from '../../src/services/rate-limiter.js'
import { RouterService } from '../../src/services/router.js'
import { valkey } from '../../src/clients/valkey.js'

describe('V1 security and failure contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails closed when budget storage is unavailable', async () => {
    vi.mocked(valkey.eval).mockRejectedValueOnce(new Error('Valkey timeout'))

    const result = await new BudgetService().checkAndDeduct({
      orgId: 'org-1', estimatedCostMicros: 100_000,
    })

    expect(result).toMatchObject({ approved: false, reason: 'budget_check_unavailable' })
  })

  it('blocks a rate-limit request when the Lua counter exceeds its configured limit', async () => {
    vi.mocked(valkey.eval).mockResolvedValueOnce([3, 30_000, 2])

    const result = await rateLimiter.check('org-1', { window_ms: 30_000, max_requests: 2 })

    expect(result).toEqual({ allowed: false, remaining: 0, resetMs: 30_000 })
  })

  it('ignores spoofed X-Forwarded-For from an untrusted remote address', () => {
    const request = {
      socket: { remoteAddress: '8.8.8.8' },
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    } as any

    expect(extractClientIp(request)).toBe('8.8.8.8')
  })

  it('rejects an unhealthy upstream before invoking its adapter', async () => {
    vi.mocked(valkey.get).mockResolvedValueOnce('unhealthy')

    await expect(providerRouter.route({
      upstream: 'anthropic-direct', upstreamModelId: 'claude-sonnet-4-6', apiKey: 'provider-key', messages: [],
    })).rejects.toBeInstanceOf(UpstreamUnavailableError)
  })

  it('does not turn an unknown model into a policy fallback', async () => {
    const result = await new RouterService().route({
      requestedModel: 'nonexistent-model-xyz',
      contextTokens: 10,
      outputTokens: 10,
      orgPolicy: { allowed_models: ['anthropic/claude-haiku-4-5'] },
    })

    expect(result.approvedModel).toBe('')
    expect(result.reasoning).toContain('not supported')
  })

  it('uses the release script after a reservation must be undone', async () => {
    vi.mocked(valkey.eval)
      .mockResolvedValueOnce([1, 'approved', '100000', '500000000'])
      .mockResolvedValueOnce([1, 'released', '0'])

    const budget = new BudgetService()
    await budget.checkAndDeduct({ orgId: 'org-1', estimatedCostMicros: 100_000 })
    await budget.releaseReservation({ orgId: 'org-1', estimatedCostMicros: 100_000 })

    expect(valkey.eval).toHaveBeenCalledTimes(2)
  })
})
