// tests/unit/router.test.ts — IntelligentRouter unit tests (§H1)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntelligentRouter } from '../../src/pillars/router.js'

// Mock the Anthropic client so no real API calls are made
vi.mock('../../src/clients/anthropic.js', () => ({
  callTokenSentryAI: vi.fn(),
  calculateCost: (inputTokens: number, outputTokens: number, model: string) => {
    const costs: Record<string, { input: number; output: number }> = {
      'claude-haiku-4-5': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'claude-opus-4-6': { input: 15.00, output: 75.00 },
    }
    const c = costs[model]
    if (!c) return 0
    return (inputTokens / 1_000_000) * c.input + (outputTokens / 1_000_000) * c.output
  },
  MODEL_COSTS: {
    'claude-haiku-4-5': { input: 0.80, output: 4.00 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-opus-4-6': { input: 15.00, output: 75.00 },
  },
}))

// Mock Redis
vi.mock('../../src/clients/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), setex: vi.fn().mockResolvedValue('OK') },
  RedisKeys: { embed: (k: string) => `embed:${k}` },
  TTL: { EMBED_SECONDS: 3600 },
}))

const { callTokenSentryAI } = await import('../../src/clients/anthropic.js')

const defaultOrgPolicy = {
  allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  max_model_tier: 'opus' as const,
  require_classification: true,
  allow_opus: true,
}

describe('IntelligentRouter', () => {
  const router = new IntelligentRouter()

  beforeEach(() => { vi.clearAllMocks() })

  it('routes low-complexity task to Haiku', async () => {
    vi.mocked(callTokenSentryAI).mockResolvedValue({
      complexity: 'low',
      recommended_model: 'claude-haiku-4-5',
      confidence: 0.95,
      reasoning: 'simple summarization task',
      estimated_output_tokens: 50,
      can_use_cache: true,
      cache_key_hint: 'email summarization',
    })

    const result = await router.route({
      orgId: 'test-org', teamId: 'test-team', userId: 'test-user',
      prompt: 'Summarize this email in 2 sentences',
      contextTokens: 100,
      userTier: 'developer',
      orgPolicy: defaultOrgPolicy,
      preservePriority: 'cost',
      requestedModel: 'claude-opus-4-6',
    })

    expect(result.approved_model).toBe('claude-haiku-4-5')
    expect(result.complexity).toBe('low')
    expect(result.overridden).toBe(true)  // Opus → Haiku
  })

  it('downgrades Opus request when org policy only allows Sonnet', async () => {
    vi.mocked(callTokenSentryAI).mockResolvedValue({
      complexity: 'frontier',
      recommended_model: 'claude-opus-4-6',
      confidence: 0.90,
      reasoning: 'complex research task',
      estimated_output_tokens: 2000,
      can_use_cache: false,
      cache_key_hint: 'research synthesis',
    })

    const result = await router.route({
      orgId: 'test-org', teamId: 'test-team', userId: 'test-user',
      prompt: 'Synthesize 50 research papers on quantum computing',
      contextTokens: 50000,
      userTier: 'analyst',
      orgPolicy: {
        allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
        max_model_tier: 'sonnet' as const,
        require_classification: true,
        allow_opus: false,
      },
      preservePriority: 'accuracy',
      requestedModel: 'claude-opus-4-6',
    })

    expect(result.approved_model).toBe('claude-sonnet-4-6')
    expect(result.recommended_model).toBe('claude-opus-4-6')  // Original recommendation preserved
    expect(result.overridden).toBe(true)
  })

  it('returns fallback when classification disabled by policy', async () => {
    const result = await router.route({
      orgId: 'test-org', teamId: 'test-team', userId: 'test-user',
      prompt: 'Do something complex',
      contextTokens: 500,
      userTier: 'developer',
      orgPolicy: {
        allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
        max_model_tier: 'sonnet' as const,
        require_classification: false,  // Classification disabled
        allow_opus: false,
      },
      preservePriority: 'cost',
      requestedModel: 'claude-haiku-4-5',
    })

    expect(callTokenSentryAI).not.toHaveBeenCalled()
    expect(result.reasoning).toBe('Classification disabled by policy')
    expect(result.approved_model).toBe('claude-haiku-4-5')
  })

  it('calculates cost correctly for Sonnet', () => {
    const cost = router.estimateCost(1_000_000, 500_000, 'claude-sonnet-4-6')
    // 1M input × $3/M + 0.5M output × $15/M = $3 + $7.50 = $10.50
    expect(cost).toBeCloseTo(10.50, 2)
  })

  it('calculates cost correctly for Haiku', () => {
    const cost = router.estimateCost(100_000, 50_000, 'claude-haiku-4-5')
    // 100K input × $0.80/M + 50K output × $4/M = $0.08 + $0.20 = $0.28
    expect(cost).toBeCloseTo(0.28, 4)
  })

  it('calculateSavings returns 0 when same model used', () => {
    const savings = router.calculateSavings(100_000, 50_000, 'claude-haiku-4-5', 'claude-haiku-4-5')
    expect(savings).toBe(0)
  })

  it('calculateSavings returns correct delta when downgraded', () => {
    const savings = router.calculateSavings(100_000, 50_000, 'claude-opus-4-6', 'claude-haiku-4-5')
    // Opus: 100K×$15/M + 50K×$75/M = $1.50 + $3.75 = $5.25
    // Haiku: 100K×$0.80/M + 50K×$4/M = $0.08 + $0.20 = $0.28
    // Savings: $5.25 - $0.28 = $4.97
    expect(savings).toBeGreaterThan(4)
    expect(savings).toBeLessThan(6)
  })
})
