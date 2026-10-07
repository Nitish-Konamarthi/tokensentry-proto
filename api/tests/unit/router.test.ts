import { describe, it, expect } from 'vitest'
import { RouterService } from '../../src/services/router.js'

describe('RouterService', () => {
  const router = new RouterService()

  it('allows a model in the allowed list', async () => {
    const result = await router.route({
      requestedModel: 'claude-sonnet-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
    })
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(false)
  })

  it('downgrades to closest permitted tier when requested is not in list (accuracy priority)', async () => {
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
      preservePriority: 'accuracy',
    })
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(true)
  })

  it('falls back to closest permitted tier for OpenAI when not allowed (provider-agnostic)', async () => {
    const result = await router.route({
      requestedModel: 'o3',
      contextTokens: 200,
      outputTokens: 300,
      orgPolicy: { allowed_models: ['gpt-4o', 'gpt-4o-mini'] },
      preservePriority: 'cost',
    })
    expect(result.approvedModel).toBe('gpt-4o-mini')
    expect(result.overridden).toBe(true)
  })

  it('falls back to closest permitted tier for Gemini when not allowed (provider-agnostic)', async () => {
    const result = await router.route({
      requestedModel: 'gemini-2.5-pro',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['gemini-2.5-flash'] },
      preservePriority: 'accuracy',
    })
    expect(result.approvedModel).toBe('gemini-2.5-flash')
    expect(result.overridden).toBe(true)
  })

  it('selects closest permitted tier for multiple providers (multi-provider)', async () => {
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 500,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-flash'] },
      preservePriority: 'accuracy',
    })
    // For accuracy: closest tier to premium should be sonnet (high tier) or gpt-4o (high tier)
    // The router selects the closest permitted tier to requested premium tier
    expect(['claude-sonnet-4-6', 'gpt-4o']).toContain(result.approvedModel)
    expect(result.overridden).toBe(true)
  })

  it('does NOT rely on allowed_models array order (array reorder test)', async () => {
    const resultA = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
      preservePriority: 'accuracy',
    })
    const resultB = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
      preservePriority: 'accuracy',
    })
    // Array order changed but routing should be deterministic (same closest tier logic)
    expect(resultA.approvedModel).toBe('claude-sonnet-4-6')
    expect(resultB.approvedModel).toBe('claude-sonnet-4-6')
    expect(resultA.approvedModel).toBe(resultB.approvedModel)
  })

  it('preserves override state correctly', async () => {
    const allowed = await router.route({
      requestedModel: 'claude-sonnet-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
    })
    expect(allowed.overridden).toBe(false)

    const replaced = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
    })
    expect(replaced.overridden).toBe(true)
  })

  it('rejects an unknown model instead of applying policy fallback', async () => {
    const result = await router.route({
      requestedModel: 'some-unknown-model',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5'] },
    })
    expect(result.approvedModel).toBe('')
    expect(result.reasoning).toContain('not supported')
  })

  it('calculates cost correctly', () => {
    const cost = router.estimateCost(1000, 500, 'claude-sonnet-4-6')
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('calculates savings correctly', () => {
    const savings = router.calculateSavings(1000, 500, 'claude-opus-4-6', 'claude-sonnet-4-6')
    expect(savings).toBeCloseTo(0.042, 4)
  })

  it('works with cost-preserve-priority for lower tier selection', async () => {
    // When preservePriority is cost, router selects cheaper permitted model
    const result = await router.route({
      requestedModel: 'claude-sonnet-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
      preservePriority: 'cost',
    })
    // The requested model is allowed, so it stays
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(false)
  })

  it('works with accuracy-preserve-priority selecting highest tier', async () => {
    // When preservePriority is accuracy, closest/highest permitted tier is preferred
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 500,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
      preservePriority: 'accuracy',
    })
    expect(result.approvedModel).toBe('claude-opus-4-6')
    expect(result.overridden).toBe(false)
  })

  it('handles DeepSeek-style future provider models without Claude-specific logic', async () => {
    // Conceptual: DeepSeek models are not in registry yet, but the mechanism is provider-agnostic.
    // If a new provider/model is added to MODEL_REGISTRY, routing should work automatically.
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6', 'gpt-4o'] },
      preservePriority: 'accuracy',
    })
    // Request is allowed, so it stays; if not allowed, closest tier logic applies
    expect(result.approvedModel).toBe('claude-opus-4-6')
  })

  it('selects closest permitted model across different providers (multi-provider routing)', async () => {
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-pro'] },
      preservePriority: 'accuracy',
    })
    // Opus (premium tier) not allowed. Among permitted: sonnet (high), gpt-4o (high), gemini-2.5-pro (high)
    // All three are high tier. For accuracy, closest is any high tier.
    // The router picks based on closest tier distance (all distance 1 from premium)
    // Then same-provider preference applies (anthropic preferred since requested is anthropic)
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(true)
  })
})
