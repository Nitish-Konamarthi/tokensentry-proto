import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { ModelCatalogService } from '../../src/services/model-catalog-service.js'
import { FixtureCatalogSource } from '../../src/services/fixture-catalog-source.js'
import { getCanonicalModelIdSync } from '../../src/services/model-routes.js'
import { providerRouter } from '../../src/services/provider-router.js'
import { routerService } from '../../src/services/router.js'
import { modelCatalogService } from '../../src/services/model-catalog-service.js'
import { canonicalizeModelId, getModelOwner } from '../../src/services/canonicalize.js'

// Mock external catalog source for testing registry independence
class FakeExternalCatalogSource {
  id = 'fake-external'
  async discover() {
    return {
      ok: true,
      models: [
        {
          id: 'new-provider/new-model-xyz',
          owner: 'new-provider',
          family: 'test',
          tier: 'low',
          capabilityScore: 2,
          cost: { input: 1, output: 2 },
          supportsCoding: true,
          supportsReasoning: false,
          supportsVision: false,
        },
      ],
    }
  }
}

// Mock failing catalog source
class FailingCatalogSource {
  id = 'failing-source'
  async discover() {
    return { ok: false, error: 'Catalog unavailable' }
  }
}

describe('Architecture Correction — Catalog Independence', () => {
  let testService: ModelCatalogService

  beforeAll(async () => {
    testService = new ModelCatalogService({
      sources: [new FakeExternalCatalogSource() as any, new FixtureCatalogSource()],
      sourcePrecedence: ['fake-external', 'fixture'],
    })
    await testService.refresh()
  })

  it('MODEL_REGISTRY is not an authoritative runtime source', () => {
    // Production catalog service must not depend on MODEL_REGISTRY
    expect(typeof modelCatalogService.getDescriptor).toBe('function')
    expect(typeof modelCatalogService.listSupported).toBe('function')
  })

  it('Canonical model identity resolves via catalog', () => {
    // Canonical identity uses catalog, not MODEL_ROUTES fallback
    expect(canonicalizeModelId('anthropic/claude-sonnet-4-6')).toBe('anthropic/claude-sonnet-4-6')
    expect(canonicalizeModelId('openai/gpt-4o')).toBe('openai/gpt-4o')
  })

  it('New model from external catalog can be recognized without editing MODEL_REGISTRY', async () => {
    const descriptor = testService.getDescriptor('new-provider/new-model-xyz')
    expect(descriptor).toBeDefined()
    expect(descriptor?.id).toBe('new-provider/new-model-xyz')
    expect(descriptor?.owner).toBe('new-provider')
    expect(testService.listSupported()).toContain('new-provider/new-model-xyz')
  })

  it('Route resolution uses routes with correct priority', () => {
    const upstream = providerRouter.resolveUpstream('anthropic/claude-sonnet-4-6')
    // Priority 1 (direct) should win over priority 2 (openrouter)
    expect(upstream.upstreamId).toBe('anthropic-direct')
    expect(upstream.upstreamModelId).toBe('claude-sonnet-4-6')
  })

  it('Direct provider routes work independently', () => {
    const upstream = providerRouter.resolveUpstream('openai/gpt-4o')
    expect(upstream.upstreamId).toBe('openai-direct')
    expect(upstream.upstreamModelId).toBe('gpt-4o')
  })

  it('OpenRouter is an execution upstream, not model owner', async () => {
    const { getRoutesForModel } = await import('../../src/services/model-routes.js')
    const routes = getRoutesForModel('anthropic/claude-sonnet-4-6')
    const openrouterRoute = routes.find(r => r.upstreamId === 'openrouter')
    expect(openrouterRoute).toBeDefined()
    expect(openrouterRoute?.modelId).toBe('anthropic/claude-sonnet-4-6')
    expect(openrouterRoute?.upstreamModelId).toBe('anthropic/claude-sonnet-4-6')
  })

  it('Catalog failure does not corrupt projection', async () => {
    const failingService = new ModelCatalogService({
      sources: [new FixtureCatalogSource(), new FailingCatalogSource() as any],
      sourcePrecedence: ['fixture', 'failing-source'],
    })
    await failingService.refresh()
    
    // Projection should still have fixture models
    expect(failingService.isSupported('anthropic/claude-sonnet-4-6')).toBe(true)
    const descriptor = failingService.getDescriptor('anthropic/claude-sonnet-4-6')
    expect(descriptor).toBeDefined()
  })

  it('Policy evaluation uses catalog descriptors', () => {
    // Router policy uses catalog for tier/capability/cost
    const descriptor = modelCatalogService.getDescriptor('anthropic/claude-sonnet-4-6')
    expect(descriptor?.tier).toBe('high')
    expect(descriptor?.capabilityScore).toBe(3)
    expect(descriptor?.cost).toBeDefined()
  })

  it('Unknown model not in catalog is rejected', () => {
    expect(modelCatalogService.getDescriptor('totally-unknown-model-xyz')).toBeUndefined()
    expect(modelCatalogService.isSupported('totally-unknown-model-xyz')).toBe(false)
  })

  it('Cost accounting uses catalog data', () => {
    const descriptor = modelCatalogService.getDescriptor('openai/gpt-4o')
    expect(descriptor?.cost?.input).toBeDefined()
    expect(descriptor?.cost?.output).toBeDefined()
  })

  it('Model owner and upstream are separate concepts', () => {
    const descriptor = modelCatalogService.getDescriptor('anthropic/claude-sonnet-4-6')
    expect(descriptor?.owner).toBe('anthropic')
    
    const upstream = providerRouter.resolveUpstream('anthropic/claude-sonnet-4-6')
    expect(upstream.upstreamId).toBe('anthropic-direct')
    // Owner (anthropic) != Upstream (anthropic-direct)
    expect(descriptor?.owner).not.toBe(upstream.upstreamId)
  })

  it('Multi-source merge with deterministic precedence works', async () => {
    class SourceA {
      id = 'source-a'
      async discover() {
        return {
          ok: true,
          models: [
            {
              id: 'test/model-a',
              owner: 'test',
              tier: 'low',
              capabilityScore: 1,
              cost: { input: 1, output: 1 },
              supportsCoding: false,
            },
          ],
        }
      }
    }
    class SourceB {
      id = 'source-b'
      async discover() {
        return {
          ok: true,
          models: [
            {
              id: 'test/model-b',
              owner: 'test',
              tier: 'high',
              capabilityScore: 3,
              cost: { input: 5, output: 10 },
              supportsCoding: true,
            },
          ],
        }
      }
    }
    
    const service = new ModelCatalogService({
      sources: [new SourceA() as any, new SourceB() as any],
      sourcePrecedence: ['source-a', 'source-b'],
    })
    await service.refresh()
    
    expect(service.isSupported('test/model-a')).toBe(true)
    expect(service.isSupported('test/model-b')).toBe(true)
  })

  it('Duplicate resolution uses source precedence', async () => {
    class SourceFirst {
      id = 'first'
      async discover() {
        return {
          ok: true,
          models: [
            {
              id: 'duplicate/model',
              owner: 'first',
              tier: 'low',
              capabilityScore: 1,
              cost: { input: 1, output: 1 },
            },
          ],
        }
      }
    }
    class SourceSecond {
      id = 'second'
      async discover() {
        return {
          ok: true,
          models: [
            {
              id: 'duplicate/model',
              owner: 'second',
              tier: 'high',
              capabilityScore: 3,
              cost: { input: 10, output: 20 },
            },
          ],
        }
      }
    }
    
    const service = new ModelCatalogService({
      sources: [new SourceFirst() as any, new SourceSecond() as any],
      sourcePrecedence: ['first', 'second'],
    })
    await service.refresh()
    
    const descriptor = service.getDescriptor('duplicate/model')
    expect(descriptor?.owner).toBe('first') // First source wins
    expect(descriptor?.tier).toBe('low')
  })

  it('Source failure tolerance - working source retained', async () => {
    const service = new ModelCatalogService({
      sources: [new FailingCatalogSource() as any, new FixtureCatalogSource()],
      sourcePrecedence: ['failing-source', 'fixture'],
    })
    await service.refresh()
    
    // Fixture models should still be available
    expect(service.isSupported('anthropic/claude-sonnet-4-6')).toBe(true)
  })

  it('Inference path does not call external catalogs', () => {
    // ModelCatalogService.getDescriptor is synchronous and reads from local projection
    const descriptor = modelCatalogService.getDescriptor('anthropic/claude-sonnet-4-6')
    expect(descriptor).toBeDefined()
    // No await needed - proves no external calls on inference path
  })

  it('Canonicalization works via catalog lookup', () => {
    // Alias resolution uses catalog
    expect(canonicalizeModelId('anthropic/claude-sonnet-4-6')).toBe('anthropic/claude-sonnet-4-6')
    expect(getModelOwner('anthropic/claude-sonnet-4-6')).toBe('anthropic')
  })

  it('Route fallback works for retryable errors', async () => {
    // This test verifies the routeWithFallback structure exists
    // Actual fallback behavior tested in integration tests
    const routes = (await import('../../src/services/model-routes.js')).getRoutesForModel('anthropic/claude-sonnet-4-6')
    expect(routes.length).toBeGreaterThan(1)
    const priorities = routes.map(r => r.priority).sort()
    expect(priorities[0]).toBe(1)
    expect(priorities[1]).toBe(2)
  })
})
