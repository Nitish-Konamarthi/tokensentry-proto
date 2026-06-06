// tests/integration/proxy.test.ts — Proxy route integration tests (§H3)
// Tests the full proxy pipeline with mocked external services
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock all external I/O
vi.mock('../../src/clients/anthropic.js', () => ({
  callTokenSentryAI: vi.fn(),
  proxyCustomerCall: vi.fn(),
  calculateCost: vi.fn().mockReturnValue(0.0003),
  MODEL_COSTS: {
    'claude-haiku-4-5': { input: 0.80, output: 4.00 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-opus-4-6': { input: 15.00, output: 75.00 },
  },
}))

vi.mock('../../src/clients/redis.js', () => {
  const store = new Map<string, string>()
  const mockRedis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => { store.set(key, val); return 'OK' }),
    setex: vi.fn(async (key: string, _ttl: number, val: string) => { store.set(key, val); return 'OK' }),
    del: vi.fn(async (...keys: string[]) => { keys.forEach(k => store.delete(k)); return keys.length }),
    eval: vi.fn().mockResolvedValue([1, 'approved', '0.0003', '500']),
    incrbyfloat: vi.fn().mockResolvedValue(0.0003),
    expire: vi.fn().mockResolvedValue(1),
    mget: vi.fn().mockResolvedValue([null, null]),
  }
  return {
    redis: new Proxy(mockRedis, { get: (t, p) => t[p as keyof typeof t] }),
    RedisKeys: {
      authApiKey: (k: string) => `auth:apikey:${k}`,
      orgBudget: (o: string, p: string) => `budget:org:${o}:${p}`,
      teamBudget: (t: string, p: string) => `budget:team:${t}:${p}`,
      userBudget: (u: string, p: string) => `budget:user:${u}:${p}`,
      orgDaily: (o: string, d: string) => `budget:org:${o}:daily:${d}`,
      embed: (k: string) => `embed:${k}`,
      analytics: (o: string, h: string) => `analytics:${o}:${h}`,
      orgConfig: (o: string) => `config:org:${o}`,
      sessionBlacklist: (j: string) => `session:blacklist:${j}`,
      agentTurns: (a: string) => `agent:turns:${a}`,
      agentLoops: (a: string) => `agent:loops:${a}`,
      agentBudget: (a: string) => `agent:budget:${a}`,
      rateLimit: (o: string, e: string, m: number) => `ratelimit:${o}:${e}:${m}`,
      dashboard: (o: string, m: number) => `dashboard:${o}:${m}`,
    },
    TTL: { AUTH_CACHE_SECONDS: 300, ANALYTICS_SECONDS: 30, EMBED_SECONDS: 3600, AGENT_SESSION_SECONDS: 3600, RATE_LIMIT_SECONDS: 120, DASHBOARD_SECONDS: 60, ORG_CONFIG_SECONDS: 300 },
    checkRedisHealth: vi.fn().mockResolvedValue(true),
    closeRedis: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../../src/clients/db.js', () => ({
  pg: Object.assign(
    vi.fn(async () => [{
      key_id: 'key-123', org_id: 'org-test', team_id: 'team-test', user_id: 'user-test',
      scopes: ['ai:proxy', 'analytics:read'], role: 'developer', plan: 'business',
      model_policy: '{"allowed_models":["claude-haiku-4-5","claude-sonnet-4-6"],"max_model_tier":"sonnet","require_classification":true,"allow_opus":false}',
      monthly_limit_usd: 500, anthropic_key_ref: null, revoked_at: null, expires_at: null,
    }]),
    { end: vi.fn() }
  ),
  checkDbHealth: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/clients/clickhouse.js', () => ({
  clickhouse: { query: vi.fn(), insert: vi.fn() },
  insertCallEvent: vi.fn().mockResolvedValue(undefined),
  checkClickhouseHealth: vi.fn().mockResolvedValue(true),
  closeClickhouse: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/instrumentation.js', () => ({}))

const { callTokenSentryAI, proxyCustomerCall } = await import('../../src/clients/anthropic.js')
const { buildApp } = await import('../../src/app.js')

let app: FastifyInstance

const TEST_API_KEY = 'ts_live_test_integration_key'

beforeAll(async () => {
  // Mock classifier + optimizer responses
  vi.mocked(callTokenSentryAI).mockImplementation(async (mode) => {
    if (mode === 'task_classifier') {
      return {
        complexity: 'low',
        recommended_model: 'claude-haiku-4-5',
        confidence: 0.95, reasoning: 'simple task',
        estimated_output_tokens: 50,
        can_use_cache: false,
        cache_key_hint: 'test',
      }
    }
    if (mode === 'prompt_optimizer') {
      return {
        optimized_prompt: 'Hello',
        pruned_history: [],
        original_token_estimate: 10,
        optimized_token_estimate: 5,
        reduction_percentage: 50,
        optimizations_applied: ['compression'],
        semantic_integrity_score: 0.99,
        compression_notes: 'removed filler',
      }
    }
    return {}
  })

  // Mock actual AI call response
  vi.mocked(proxyCustomerCall).mockResolvedValue({
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: '4' }],
    model: 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 3 },
  } as never)

  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

describe('POST /v1/proxy/messages', () => {

  it('returns 401 without authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy/messages',
      body: { model: 'claude-opus-4-6', max_tokens: 50, messages: [{ role: 'user', content: 'Hi' }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with malformed API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy/messages',
      headers: { authorization: 'Bearer not-a-valid-key' },
      body: { model: 'claude-opus-4-6', max_tokens: 50, messages: [{ role: 'user', content: 'Hi' }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('succeeds with valid key and returns TS headers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy/messages',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'What is 2+2?' }],
      }),
    })

    expect(res.statusCode).toBe(200)
    // Should have been routed to Haiku despite requesting Opus
    expect(res.headers['x-ts-approved-model']).toBe('claude-haiku-4-5')
    expect(res.headers['x-ts-original-model']).toBe('claude-opus-4-6')
  })

  it('health endpoint returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('OK')
  })

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy/messages',
      headers: { authorization: `Bearer ${TEST_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5' }),  // missing max_tokens + messages
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /health/live', () => {
  it('returns status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { status: string }
    expect(body.status).toBe('ok')
  })
})
