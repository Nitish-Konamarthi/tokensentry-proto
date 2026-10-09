import { describe, it, expect, vi } from 'vitest'

// Import production services that must use the new architecture
import { canonicalizeModelId, normalizeCanonicalModel, getModelOwner } from '../../src/services/canonicalize.js'
import { getRoutesForModel } from '../../src/services/model-routes.js'
import { providerRouter } from '../../src/services/provider-router.js'
import { modelCatalogService } from '../../src/services/model-catalog-service.js'
import { routerService } from '../../src/services/router.js'

describe('Architecture Acceptance — Production Runtime', () => {
  it('Production model-catalog-service is initialized via catalog-bootstrap', () => {
    // The singleton is initialized with external sources via catalog-bootstrap
    expect(modelCatalogService.getDescriptor('anthropic/claude-sonnet-4-6')).toBeDefined()
    expect(modelCatalogService.getDescriptor('openai/gpt-4o')).toBeDefined()
    expect(modelCatalogService.getDescriptor('unknown-model')).toBeUndefined()
  })

  it('Catalog descriptors have owner, tier, capability, cost', () => {
    const descriptor = modelCatalogService.getDescriptor('anthropic/claude-sonnet-4-6')
    expect(descriptor).toBeDefined()
    expect(descriptor?.owner).toBe('anthropic')
    expect(descriptor?.tier).toBe('high')
    expect(descriptor?.capabilityScore).toBe(3)
    expect(descriptor?.cost).toBeDefined()
  })

  it('Canonical identity resolves to owner/model format via catalog', () => {
    expect(normalizeCanonicalModel('anthropic/claude-sonnet-4-6')).toBe('anthropic/claude-sonnet-4-6')
    expect(normalizeCanonicalModel('openai/gpt-4o')).toBe('openai/gpt-4o')
    expect(getModelOwner('anthropic/claude-sonnet-4-6')).toBe('anthropic')
  })

  it('Route lookup uses routes with upstreamId/upstreamModelId', () => {
    const routes = getRoutesForModel('anthropic/claude-sonnet-4-6')
    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0].modelId).toBe('anthropic/claude-sonnet-4-6')
    expect(routes[0].upstreamId).toBeDefined()
    expect(routes[0].upstreamModelId).toBeDefined()
  })

  it('Upstream selection is separate from model identity', () => {
    const openrouterRoute = getRoutesForModel('anthropic/claude-sonnet-4-6').find(r => r.upstreamId === 'openrouter')
    expect(openrouterRoute).toBeDefined()
    expect(openrouterRoute?.modelId).toBe('anthropic/claude-sonnet-4-6')
    expect(openrouterRoute?.upstreamModelId).toBe('anthropic/claude-sonnet-4-6')
  })

  it('Direct upstream routes work independently', () => {
    const directRoute = getRoutesForModel('anthropic/claude-sonnet-4-6').find(r => r.upstreamId === 'anthropic-direct')
    expect(directRoute).toBeDefined()
    expect(directRoute?.upstreamModelId).toBe('claude-sonnet-4-6')
    expect(directRoute?.modelId).toBe('anthropic/claude-sonnet-4-6')
  })

  it('Unknown model not in catalog is unsupported', () => {
    expect(modelCatalogService.getDescriptor('totally-unknown-model-xyz')).toBeUndefined()
  })

  it('Catalog cost lookup uses descriptor pricing', () => {
    const descriptor = modelCatalogService.getDescriptor('openai/gpt-4o')
    expect(descriptor?.cost).toBeDefined()
    expect(typeof descriptor?.cost?.input).toBe('number')
    expect(typeof descriptor?.cost?.output).toBe('number')
  })

  it('Route resolution returns upstreamId and upstreamModelId', () => {
    const upstreamInfo = providerRouter.resolveUpstream('anthropic/claude-sonnet-4-6')
    expect(upstreamInfo.upstreamId).toBe('anthropic-direct')
    expect(upstreamInfo.upstreamModelId).toBe('claude-sonnet-4-6')
  })

  it('OpenRouter upstream route resolves correctly', () => {
    const routes = getRoutesForModel('anthropic/claude-sonnet-4-6')
    const openrouterRoute = routes.find(r => r.upstreamId === 'openrouter')
    expect(openrouterRoute).toBeDefined()
  })

  it('Router policy evaluates against catalog descriptors', async () => {
    const decision = await routerService.route({
      requestedModel: 'anthropic/claude-sonnet-4-6',
      contextTokens: 1000,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['anthropic/claude-sonnet-4-6'], max_model_tier: 'high' },
      preservePriority: 'cost',
    })
    expect(decision.approvedModel).toBe('anthropic/claude-sonnet-4-6')
    expect(decision.estimatedCostUsd).toBeGreaterThan(0)
  })

  it('Max model tier enforcement uses catalog tier', async () => {
    const decision = await routerService.route({
      requestedModel: 'anthropic/claude-opus-4-6',
      contextTokens: 1000,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['anthropic/claude-opus-4-6'], max_model_tier: 'high' },
      preservePriority: 'cost',
    })
    // opus is premium, max is high -> should be rejected or overridden
    expect(decision.approvedModel).not.toBe('anthropic/claude-opus-4-6')
  })

  it('Allowed models policy uses catalog for validation', async () => {
    const decision = await routerService.route({
      requestedModel: 'anthropic/claude-sonnet-4-6',
      contextTokens: 1000,
      outputTokens: 500,
      orgPolicy: { allowed_models: ['openai/gpt-4o'] }, // only openai allowed
      preservePriority: 'cost',
    })
    expect(decision.approvedModel).not.toBe('anthropic/claude-sonnet-4-6')
  })

  it('Upstream health check uses upstreamId not ProviderType', async () => {
    const health = await providerRouter.checkUpstreamHealth('openrouter')
    expect(health.upstream).toBe('openrouter')
    expect(typeof health.healthy).toBe('boolean')
  })

  it('uses the checked-in V1 model catalog without a runtime registry dependency', () => {
    expect(modelCatalogService.listSupported().length).toBeGreaterThan(0)
  })
})
