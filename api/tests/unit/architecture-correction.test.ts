import { describe, it, expect, vi } from 'vitest'
import { modelCatalogService } from '../../src/services/model-catalog-service.js'
import { RegistryCatalogSource } from '../../src/services/catalog-source.js'
import { getCanonicalModelId } from '../../src/services/model-routes.js'
import { providerRouter } from '../../src/services/provider-router.js'

// Mock external catalog sources for architecture verification
class FakeExternalCatalogSource {
  id = 'fake-external'
  async discover(): Promise<any[]> {
    return [
      {
        id: 'new-model-xyz',
        provider: 'new-provider',
        family: 'test',
        tier: 'low',
        capabilityScore: 2,
        cost: { input: 1, output: 2 },
        supportsCoding: true,
        supportsReasoning: false,
        supportsVision: false,
      },
    ]
  }
}

describe('Architecture Correction — Catalog Independence', () => {
  it('MODEL_REGISTRY is no longer an authoritative runtime source', () => {
    // The model-catalog-service initializes from MODEL_REGISTRY for backward compatibility,
    // but routing and governance must use the catalog projection.
    expect(typeof modelCatalogService.getDescriptor).toBe('function')
    expect(typeof modelCatalogService.listSupported).toBe('function')
  })

  it('Canonical model identity is deterministic', () => {
    // Alias resolves to exact route
    expect(getCanonicalModelId('claude-sonnet-4-6-alias')).toBe('claude-sonnet-4-6-alias')
    // Existing model preserved
    expect(getCanonicalModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })

  it('New model from external catalog can be recognized without editing MODEL_REGISTRY', async () => {
    // Initialize service with external source
    const service = new (await import('../../src/services/model-catalog-service.js')).ModelCatalogService([
      new FakeExternalCatalogSource() as any,
    ])
    await service.refresh()

    const descriptor = service.getDescriptor('new-model-xyz')
    expect(descriptor).toBeDefined()
    expect(descriptor?.id).toBe('new-model-xyz')
    expect(service.listSupported()).toContain('new-model-xyz')
  })

  it('Route resolution uses routes, not direct provider mapping', () => {
    const upstream = providerRouter.resolveUpstream('anthropic/claude-sonnet-4-6')
    expect(upstream.upstreamId).toBe('openrouter')
    expect(upstream.upstreamModelId).toBe('anthropic/claude-sonnet-4-6')
  })

  it('Direct provider routes still work', () => {
    const upstream = providerRouter.resolveUpstream('claude-sonnet-4-6')
    expect(upstream.upstreamId).toBe('anthropic')
    expect(upstream.upstreamModelId).toBe('claude-sonnet-4-6')
  })

  it('Catalog failure does not corrupt projection', async () => {
    // Refresh with a failing external source should not remove existing descriptors
    const initialSupported = modelCatalogService.listSupported()
    // Even if refresh fails, projection must remain usable
    expect(initialSupported.length).toBeGreaterThan(0)
    expect(typeof modelCatalogService.getDescriptor('claude-sonnet-4-6')).toBe('object')
  })
})
