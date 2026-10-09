import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/config/env.js', () => ({
  env: {
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
  },
  ValkeyKeys: {
    providerHealth: (upstream: string) => `providerHealth:${upstream}`,
    realtimeSpend: (orgId: string, date: string) => `realtimeSpend:${orgId}:${date}`,
  },
}))

import { ProviderRouterService, UnsupportedModelError } from '../../src/services/provider-router.js'
import { ModelCatalogService, setCatalogService } from '../../src/services/model-catalog-service.js'
import type { CatalogSource, ModelDescriptor } from '../../src/services/model-catalog.js'
import { openRouterAdapter } from '../../src/clients/upstreams/openrouter.js'

function createCatalogSource(id: string, models: ModelDescriptor[]): CatalogSource {
  return {
    id,
    discover: async () => ({ ok: true, models }),
    refresh: async () => {},
  }
}

describe('Dynamic Route Resolution', () => {
  let router: ProviderRouterService

  beforeEach(() => {
    vi.clearAllMocks()
    router = new ProviderRouterService()
  })

  it('resolves a dynamically discovered model to OpenRouter without MODEL_ROUTES entry', async () => {
    const dynamicModel: ModelDescriptor = {
      id: 'anthropic/new-model-xyz',
      owner: 'anthropic',
      family: 'new-family',
      tier: 'standard',
      capabilityScore: 2,
      cost: { input: 1.0, output: 2.0 },
      supportsCoding: true,
      supportsReasoning: false,
    }

    const source = createCatalogSource('test-source', [dynamicModel])
    const catalogService = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    setCatalogService(catalogService)
    await catalogService.refresh()

    const result = router.resolveUpstream('anthropic/new-model-xyz')

    expect(result.upstreamId).toBe('openrouter')
    expect(result.upstreamModelId).toBe('anthropic/new-model-xyz')
  })

  it('rejects unknown models that are not in catalog', async () => {
    const source = createCatalogSource('test-source', [])
    const catalogService = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    setCatalogService(catalogService)
    await catalogService.refresh()

    expect(() => router.resolveUpstream('unknown/model')).toThrow(UnsupportedModelError)
  })

  it('rejects known catalog models with no eligible upstream', async () => {
    const model: ModelDescriptor = {
      id: 'unknownmodel',
      owner: 'unknown-provider',
      family: 'some-family',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    const source = createCatalogSource('test-source', [model])
    const catalogService = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    setCatalogService(catalogService)
    await catalogService.refresh()

    expect(() => router.resolveUpstream('unknownmodel')).toThrow(UnsupportedModelError)
  })

  it('prefers explicit routes over dynamic routes', async () => {
    const model: ModelDescriptor = {
      id: 'anthropic/claude-sonnet-4-6',
      owner: 'anthropic',
      family: 'claude',
      tier: 'high',
      cost: { input: 3.0, output: 15.0 },
    }

    const source = createCatalogSource('test-source', [model])
    const catalogService = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    setCatalogService(catalogService)
    await catalogService.refresh()

    const result = router.resolveUpstream('anthropic/claude-sonnet-4-6')

    expect(result.upstreamId).toBe('anthropic-direct')
    expect(result.upstreamModelId).toBe('claude-sonnet-4-6')
  })

  it('does not mutate MODEL_ROUTES when resolving dynamic routes', async () => {
    const { MODEL_ROUTES } = await import('../../src/services/model-routes.js')
    const before = MODEL_ROUTES.length

    const dynamicModel: ModelDescriptor = {
      id: 'openai/another-model',
      owner: 'openai',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    const source = createCatalogSource('test-source', [dynamicModel])
    const catalogService = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    setCatalogService(catalogService)
    await catalogService.refresh()
    router.resolveUpstream('openai/another-model')

    expect(MODEL_ROUTES.length).toBe(before)
  })
})
