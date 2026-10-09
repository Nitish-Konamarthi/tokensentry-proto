import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/config/env.js', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter-test.example.com/api/v1',
    OPENROUTER_HTTP_REFERER: undefined,
    OPENROUTER_X_TITLE: undefined,
  },
}))

vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
    hget: vi.fn().mockResolvedValue(null),
    incrbyfloat: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
  },
  ValkeyKeys: {
    providerHealth: (upstream: string) => `providerHealth:${upstream}`,
    realtimeSpend: (orgId: string, date: string) => `realtimeSpend:${orgId}:${date}`,
  },
}))

vi.mock('../../src/clients/providers/anthropic.js', () => ({
  callAnthropic: vi.fn(),
}))

vi.mock('../../src/clients/upstreams/openrouter.js', () => ({
  openRouterAdapter: {
    id: 'openrouter',
    chat: vi.fn(),
    health: vi.fn(),
    supports: vi.fn().mockReturnValue(true),
  },
}))

import { ProviderRouterService } from '../../src/services/provider-router.js'
import { ProviderRequestError } from '../../src/lib/provider-fetch.js'
import { normalizeErrorCategory } from '../../src/services/error-taxonomy.js'
import { callAnthropic } from '../../src/clients/providers/anthropic.js'
import { openRouterAdapter } from '../../src/clients/upstreams/openrouter.js'

function createMockResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('Analytics Attempt Telemetry', () => {
  let router: ProviderRouterService

  beforeEach(() => {
    vi.clearAllMocks()
    router = new ProviderRouterService()
  })

  it('records actual attempt history when fallback occurs', async () => {
    callAnthropic.mockRejectedValue(
      new ProviderRequestError('PROVIDER_TIMEOUT', 'Anthropic timeout', 'anthropic', 504, true),
    )

    const mockResponse = createMockResponse('Hello from OpenRouter')
    openRouterAdapter.chat.mockResolvedValue(mockResponse)
    openRouterAdapter.health.mockResolvedValue({
      healthy: true,
      upstreamId: 'openrouter',
      lastCheckedAt: Date.now(),
    })

    const result = await router.routeWithFallback({
      model: 'anthropic/claude-sonnet-4-6',
      orgId: 'org-123',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toMatchObject({
      attemptNumber: 1,
      upstream: 'anthropic-direct',
      upstreamModelId: 'claude-sonnet-4-6',
      routePriority: 1,
      success: false,
      errorCategory: 'TIMEOUT',
    })
    expect(result.attempts[1]).toMatchObject({
      attemptNumber: 2,
      upstream: 'openrouter',
      upstreamModelId: 'anthropic/claude-sonnet-4-6',
      routePriority: 2,
      success: true,
    })
    expect(result.fallbackUsed).toBe(true)
    expect(result.fallbackUpstream).toBe('openrouter')
  })

  it('normalizes provider error codes to canonical categories', () => {
    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_TIMEOUT', 'timeout', 'anthropic', 504, true),
    )).toBe('TIMEOUT')

    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_AUTH', 'auth', 'anthropic', 401, false),
    )).toBe('AUTH')

    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_RATE_LIMIT', 'rate limit', 'anthropic', 429, false),
    )).toBe('RATE_LIMIT')

    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_BAD_REQUEST', 'bad request', 'anthropic', 400, false),
    )).toBe('BAD_REQUEST')

    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_UNAVAILABLE', 'unavailable', 'anthropic', 500, true),
    )).toBe('SERVER_ERROR')

    expect(normalizeErrorCategory(
      new ProviderRequestError('PROVIDER_NETWORK', 'network', 'anthropic', 502, true),
    )).toBe('NETWORK')
  })

  it('records single attempt when no fallback is needed', async () => {
    const mockResponse = createMockResponse('Hello from Anthropic')
    callAnthropic.mockResolvedValue(mockResponse)

    const result = await router.routeWithFallback({
      model: 'anthropic/claude-sonnet-4-6',
      orgId: 'org-123',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]).toMatchObject({
      attemptNumber: 1,
      upstream: 'anthropic-direct',
      success: true,
    })
    expect(result.fallbackUsed).toBe(false)
    expect(result.fallbackUpstream).toBeUndefined()
  })

  it('records CONFIGURATION error when credential is missing', async () => {
    const { valkey } = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.hget).mockResolvedValue(null)

    const { env } = await import('../../src/config/env.js')
    const originalKey = env.ANTHROPIC_API_KEY
    ;(env as any).ANTHROPIC_API_KEY = undefined

    openRouterAdapter.health.mockResolvedValue({
      healthy: true,
      upstreamId: 'openrouter',
      lastCheckedAt: Date.now(),
    })
    openRouterAdapter.chat.mockResolvedValue(createMockResponse('Hello from OpenRouter'))

    const result = await router.routeWithFallback({
      model: 'anthropic/claude-sonnet-4-6',
      orgId: 'org-123',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toMatchObject({
      attemptNumber: 1,
      upstream: 'anthropic-direct',
      success: false,
      errorCategory: 'CONFIGURATION',
    })
    expect(result.attempts[1]).toMatchObject({
      attemptNumber: 2,
      upstream: 'openrouter',
      success: true,
    })

    ;(env as any).ANTHROPIC_API_KEY = originalKey
  })
})
