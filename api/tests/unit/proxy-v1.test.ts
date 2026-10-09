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
        keyId: 'key-1', role: 'admin', plan: 'business', scopes: ['proxy'],
      })
    }),
  },
}))
vi.mock('../../src/intelligence/decision-engine/DecisionEngine.js', () => ({
  decisionEngine: { decide: vi.fn() },
}))
import { proxyRoutes } from '../../src/routes/proxy.js'
import Fastify from 'fastify'
import { decisionEngine } from '../../src/intelligence/decision-engine/DecisionEngine.js'
import { valkey } from '../../src/clients/valkey.js'
describe('V1 AI Proxy', () => {
  let app: any
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(valkey.eval).mockResolvedValue([1, 60_000, 100])
    app = Fastify({ logger: false })
    app.decorateRequest('callId', 'test-call-id')
    await proxyRoutes(app)
    app.ready()
  })
  it('successful request', async () => {
    vi.mocked(decisionEngine.decide).mockResolvedValue({
      statusCode: 200,
      body: { model: 'claude-sonnet-4-6', choices: [] },
    })
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_valid_key_12345678' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }], stream: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ model: 'claude-sonnet-4-6', choices: [] })
    expect(res.headers['x-call-id']).toBe('test-call-id')
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
    vi.mocked(decisionEngine.decide).mockResolvedValue({
      statusCode: 200,
      streamHandler: async (reply: any) => {
        reply.type('text/event-stream').send('data: streamed\n\n')
      },
    })
    const res = await app.inject({
      method: 'POST', url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_valid_key_12345678' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }], stream: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toBe('data: streamed\n\n')
  })
})
