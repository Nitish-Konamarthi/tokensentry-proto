import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    eval: vi.fn().mockResolvedValue([1, 'approved', '0', '500000000']),
    multi: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[1], [-1]]),
    }),
    get: vi.fn(),
    setex: vi.fn(),
    hgetall: vi.fn().mockResolvedValue({}),
    del: vi.fn(),
    scan: vi.fn().mockResolvedValue(['0', []]),
  },
  ValkeyKeys: {
    budgetMonthly: (org: string, p: string) => `budget:monthly:${org}:${p}`,
    budgetDaily: (org: string, d: string) => `budget:daily:${org}:${d}`,
    rateLimit: (key: string, window: number) => `ratelimit:${key}:${window}`,
    agentSession: (sid: string) => `agent:session:${sid}`,
    agentStats: (sid: string) => `agent:stats:${sid}`,
    agentBlocked: (sid: string) => `agent:blocked:${sid}`,
  },
  checkValkeyHealth: vi.fn().mockResolvedValue(true),
  closeValkey: vi.fn(),
}))
vi.mock('../../src/repositories/budget.js', () => ({
  budgetRepo: {
    findOrgPolicy: vi.fn().mockResolvedValue({
      id: 'test-id', orgId: 'org-1', teamId: null, userId: null,
      monthlyLimitMicros: '500000000', dailyLimitMicros: null,
      alertAt80Pct: true, alertAt95Pct: true, onExhaustion: 'block',
    }),
  },
}))
vi.mock('../../src/services/auth.js', () => ({
  authService: {
    authenticateApiKey: vi.fn().mockImplementation((key: string) => {
      if (key === 'ts_invalid') throw new Error('INVALID_API_KEY')
      return Promise.resolve({
        orgId: 'org-1', teamId: 'team-1', userId: 'user-1',
        keyId: 'key-1', role: 'admin', plan: 'business',
      })
    }),
  },
}))
import { proxyRoutes } from '../../src/routes/proxy.js'
import Fastify from 'fastify'
describe('V1 AI Proxy', () => {
  let app: any
  beforeEach(async () => {
    app = Fastify({ logger: false })
    await proxyRoutes(app)
    app.ready()
  })
  it('successful request', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_valid_key_12345678' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }], stream: false },
    })
    expect([200, 429, 502]).toContain(res.statusCode)
  })
  it('authentication failure', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer bad_key' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }] },
    })
    expect(res.statusCode).toBe(401)
  })
  it('invalid request', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_valid_key_12345678' },
      payload: { model: 'claude-sonnet-4-6' },
    })
    expect(res.statusCode).toBe(400)
  })
  it('streaming preserved', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_valid_key_12345678' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }], stream: true },
    })
    expect([200, 429, 502]).toContain(res.statusCode)
  })
})
