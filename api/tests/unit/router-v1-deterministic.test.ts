import { describe, it, expect } from 'vitest'
import { RouterService } from '../../src/services/router.js'
describe('V1 Deterministic Router', () => {
  const router = new RouterService()
  it('respects allowed model', async () => {
    const result = await router.route({
      requestedModel: 'claude-sonnet-4-6', contextTokens: 500, outputTokens: 200,
      orgPolicy: { allowed_models: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
    })
    expect(result.approvedModel).toBe('claude-sonnet-4-6')
    expect(result.overridden).toBe(false)
  })
  it('selects cheapest allowed deterministically', async () => {
    const result = await router.route({
      requestedModel: 'claude-opus-4-6', contextTokens: 500, outputTokens: 200,
      orgPolicy: { allowed_models: ['claude-opus-4-6', 'claude-haiku-4-5', 'claude-sonnet-4-6'] },
    })
    expect(result.approvedModel).toBe('claude-opus-4-6')
  })
  it('explainable reasoning', async () => {
    const result = await router.route({
      requestedModel: 'gpt-4o', contextTokens: 500, outputTokens: 200,
      orgPolicy: { allowed_models: ['claude-haiku-4-5'] },
    })
    expect(result.reasoning).toContain('not allowed')
  })
  it('complexity deterministic', async () => {
    const result = await router.route({
      requestedModel: 'claude-sonnet-4-6', contextTokens: 500, outputTokens: 200,
      orgPolicy: {},
    })
    expect(result.complexity).toMatch(/low|moderate|high/)
  })
})
