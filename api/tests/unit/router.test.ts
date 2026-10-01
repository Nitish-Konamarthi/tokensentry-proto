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

  it('downgrades to allowed model when requested is not in list', async () => {
    const result = await router.route({
      requestedModel: 'claude-opus-4-6',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'] },
    })
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(true)
  })

  it('falls back to haiku when no allowed model matches', async () => {
    const result = await router.route({
      requestedModel: 'some-unknown-model',
      contextTokens: 100,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['claude-haiku-4-5'] },
    })
    expect(result.approvedModel).toBe('claude-haiku-4-5')
  })

  it('calculates cost correctly', () => {
    const cost = router.estimateCost(1000, 500, 'claude-sonnet-4-6')
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('calculates savings correctly', () => {
    const savings = router.calculateSavings(1000, 500, 'claude-opus-4-6', 'claude-sonnet-4-6')
    expect(savings).toBeCloseTo(0.042, 4)
  })
})
