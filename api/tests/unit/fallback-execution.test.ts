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
    setex: vi.fn().mockResolvedValue('OK'),
    hget: vi.fn().mockResolvedValue(null),
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

describe('Fallback Execution with Per-Upstream Credentials', () => {
  let router: ProviderRouterService

  beforeEach(() => {
    vi.clearAllMocks()
    router = new ProviderRouterService()
  })

  it('falls back to OpenRouter when Anthropic times out, using per-upstream credentials', async () => {
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
      maxTokens: 100,
    })

    expect(result.fallbackUsed).toBe(true)
    expect(result.fallbackUpstream).toBe('openrouter')
    expect(result.finalRoute.upstreamId).toBe('openrouter')
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toMatchObject({
      attemptNumber: 1,
      upstream: 'anthropic-direct',
      success: false,
      errorCategory: 'TIMEOUT',
    })
    expect(result.attempts[1]).toMatchObject({
      attemptNumber: 2,
      upstream: 'openrouter',
      success: true,
    })

    expect(callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-anthropic-key' }),
    )
    expect(openRouterAdapter.chat).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-openrouter-key' }),
    )
  })

  it('does NOT fallback on AUTH failure', async () => {
    callAnthropic.mockRejectedValue(
      new ProviderRequestError('PROVIDER_AUTH', 'Invalid API key', 'anthropic', 401, false),
    )

    const chatSpy = vi.spyOn(openRouterAdapter, 'chat')

    await expect(
      router.routeWithFallback({
        model: 'anthropic/claude-sonnet-4-6',
        orgId: 'org-123',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow('Invalid API key')

    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('attempts both routes when both fail with 500', async () => {
    callAnthropic.mockRejectedValue(
      new ProviderRequestError('PROVIDER_UNAVAILABLE', 'Anthropic 500', 'anthropic', 500, true),
    )
    openRouterAdapter.chat.mockRejectedValue(
      new ProviderRequestError('PROVIDER_UNAVAILABLE', 'OpenRouter 500', 'openrouter', 500, true),
    )
    openRouterAdapter.health.mockResolvedValue({
      healthy: true,
      upstreamId: 'openrouter',
      lastCheckedAt: Date.now(),
    })

    await expect(
      router.routeWithFallback({
        model: 'anthropic/claude-sonnet-4-6',
        orgId: 'org-123',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow()

    expect(callAnthropic).toHaveBeenCalledTimes(1)
    expect(openRouterAdapter.chat).toHaveBeenCalledTimes(1)
  })

  it('skips unhealthy upstreams and tries next eligible route (not a fallback)', async () => {
    openRouterAdapter.health.mockResolvedValue({
      healthy: true,
      upstreamId: 'openrouter',
      lastCheckedAt: Date.now(),
    })

    const { valkey } = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.get).mockImplementation(async (key: string) => {
      if (key === 'providerHealth:anthropic-direct') return 'unhealthy'
      return null
    })

    const mockResponse = createMockResponse('Hello from OpenRouter')
    openRouterAdapter.chat.mockResolvedValue(mockResponse)

    const result = await router.routeWithFallback({
      model: 'anthropic/claude-sonnet-4-6',
      orgId: 'org-123',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Skipping unhealthy upstream is NOT a fallback - it's normal routing to next available
    expect(result.fallbackUsed).toBe(false)
    expect(result.finalRoute.upstreamId).toBe('openrouter')
    expect(callAnthropic).not.toHaveBeenCalled()
    expect(openRouterAdapter.chat).toHaveBeenCalledTimes(1)
    // Verify the attempt was marked as skipped
    const skippedAttempt = result.attempts.find(a => a.skipped)
    expect(skippedAttempt).toBeDefined()
    expect(skippedAttempt?.skippedReason).toBe('upstream_unhealthy')
  })

  it('does NOT fallback on 429 rate limit', async () => {
    callAnthropic.mockRejectedValue(
      new ProviderRequestError('PROVIDER_RATE_LIMIT', 'Rate limited', 'anthropic', 429, false),
    )

    const { valkey } = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.get).mockImplementation(async (key: string) => {
      if (key === 'providerHealth:anthropic-direct') return null
      return null
    })

    const chatSpy = vi.spyOn(openRouterAdapter, 'chat')

    await expect(
      router.routeWithFallback({
        model: 'anthropic/claude-sonnet-4-6',
        orgId: 'org-123',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow('Rate limited')

    expect(chatSpy).not.toHaveBeenCalled()
  })
})