import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ModelCatalogService } from '../../src/services/model-catalog-service.js'
import type { CatalogSource, ModelDescriptor } from '../../src/services/model-catalog.js'

function createSource(
  id: string,
  models: ModelDescriptor[],
  opts: { fail?: boolean } = {},
): CatalogSource {
  return {
    id,
    discover: async () => {
      if (opts.fail) {
        return { ok: false, error: 'Source unavailable' }
      }
      return { ok: true, models }
    },
    refresh: async () => {},
  }
}

describe('Last-Known-Good Catalog Semantics', () => {
  let service: ModelCatalogService

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retains previous snapshot when a source fails on refresh', async () => {
    const modelA: ModelDescriptor = {
      id: 'provider-a/model-a',
      owner: 'provider-a',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }
    const modelB: ModelDescriptor = {
      id: 'provider-b/model-b',
      owner: 'provider-b',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    let sourceAFail = false
    const sourceA: CatalogSource = {
      id: 'source-a',
      discover: async () => {
        if (sourceAFail) return { ok: false, error: 'Source A unavailable' }
        return { ok: true, models: [modelA] }
      },
      refresh: async () => {},
    }
    const sourceB = createSource('source-b', [modelB])

    service = new ModelCatalogService({
      sources: [sourceA, sourceB],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['source-a', 'source-b'],
    })

    await service.refresh()
    expect(service.isSupported('provider-a/model-a')).toBe(true)
    expect(service.isSupported('provider-b/model-b')).toBe(true)

    sourceAFail = true
    await service.refresh()

    expect(service.isSupported('provider-a/model-a')).toBe(true)
    expect(service.isSupported('provider-b/model-b')).toBe(true)

    const snapshotA = service.getSourceSnapshot('source-a')
    expect(snapshotA?.status).toBe('unhealthy')
    expect(snapshotA?.models).toHaveLength(1)
  })

  it('handles partial source failure: retains failed source, updates successful source', async () => {
    const modelA1: ModelDescriptor = {
      id: 'provider-a/model-a1',
      owner: 'provider-a',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }
    const modelB1: ModelDescriptor = {
      id: 'provider-b/model-b1',
      owner: 'provider-b',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }
    const modelB2: ModelDescriptor = {
      id: 'provider-b/model-b2',
      owner: 'provider-b',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    let sourceAFail = false
    const sourceA: CatalogSource = {
      id: 'source-a',
      discover: async () => {
        if (sourceAFail) return { ok: false, error: 'Source A down' }
        return { ok: true, models: [modelA1] }
      },
      refresh: async () => {},
    }

    let sourceBModels = [modelB1]
    const sourceB: CatalogSource = {
      id: 'source-b',
      discover: async () => ({ ok: true, models: sourceBModels }),
      refresh: async () => {},
    }

    service = new ModelCatalogService({
      sources: [sourceA, sourceB],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['source-a', 'source-b'],
    })

    await service.refresh()
    expect(service.isSupported('provider-a/model-a1')).toBe(true)
    expect(service.isSupported('provider-b/model-b1')).toBe(true)
    expect(service.isSupported('provider-b/model-b2')).toBe(false)

    sourceAFail = true
    sourceBModels = [modelB1, modelB2]
    await service.refresh()

    expect(service.isSupported('provider-a/model-a1')).toBe(true)
    expect(service.isSupported('provider-b/model-b1')).toBe(true)
    expect(service.isSupported('provider-b/model-b2')).toBe(true)

    const snapshotA = service.getSourceSnapshot('source-a')
    expect(snapshotA?.status).toBe('unhealthy')
    expect(snapshotA?.models).toHaveLength(1)

    const snapshotB = service.getSourceSnapshot('source-b')
    expect(snapshotB?.status).toBe('healthy')
    expect(snapshotB?.models).toHaveLength(2)
  })

  it('treats an empty catalog response as unhealthy and retains the last known good snapshot', async () => {
    let returnEmpty = false
    const source: CatalogSource = {
      id: 'test-source',
      discover: async () => ({ ok: true, models: returnEmpty ? [] : [{ id: 'provider/model', owner: 'provider', tier: 'standard', cost: { input: 1, output: 2 } }] }),
      refresh: async () => {},
    }

    service = new ModelCatalogService({
      sources: [source],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['test-source'],
    })

    await service.refresh()
    expect(service.getCatalogHealth()).toBe('healthy')
    expect(service.getSourceSnapshot('test-source')?.status).toBe('healthy')
    expect(service.isSupported('provider/model')).toBe(true)

    returnEmpty = true
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('degraded')
    expect(service.getSourceSnapshot('test-source')?.status).toBe('unhealthy')
    expect(service.isSupported('provider/model')).toBe(true)
  })

  it('rejects invalid model metadata without replacing a valid snapshot', async () => {
    let invalid = false
    const source: CatalogSource = {
      id: 'validated-source',
      discover: async () => ({ ok: true, models: invalid
        ? [{ id: 'provider/model', owner: '', tier: 'strange' as any, cost: { input: -1, output: Number.NaN } }]
        : [{ id: 'provider/model', owner: 'provider', tier: 'standard', cost: { input: 1, output: 2 } }] }),
    }
    service = new ModelCatalogService({ sources: [source] })
    await service.refresh()
    invalid = true
    await service.refresh()
    expect(service.getSourceSnapshot('validated-source')?.status).toBe('unhealthy')
    expect(service.isSupported('provider/model')).toBe(true)
  })

  it('reports unavailable when all sources fail on first boot', async () => {
    const sourceA = createSource('source-a', [], { fail: true })
    const sourceB = createSource('source-b', [], { fail: true })

    service = new ModelCatalogService({
      sources: [sourceA, sourceB],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['source-a', 'source-b'],
    })

    await service.refresh()

    expect(service.getCatalogHealth()).toBe('unavailable')
    expect(service.listSupported()).toHaveLength(0)
    expect(service.getSourceSnapshot('source-a')?.status).toBe('unhealthy')
    expect(service.getSourceSnapshot('source-b')?.status).toBe('unhealthy')
  })

  it('reports degraded when some sources fail', async () => {
    const modelA: ModelDescriptor = {
      id: 'provider-a/model-a',
      owner: 'provider-a',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    const sourceA = createSource('source-a', [modelA])
    const sourceB = createSource('source-b', [], { fail: true })

    service = new ModelCatalogService({
      sources: [sourceA, sourceB],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['source-a', 'source-b'],
    })

    await service.refresh()

    expect(service.getCatalogHealth()).toBe('degraded')
    expect(service.isSupported('provider-a/model-a')).toBe(true)
  })

  it('recovers to healthy after successful refresh following failure', async () => {
    const modelA: ModelDescriptor = {
      id: 'provider-a/model-a',
      owner: 'provider-a',
      tier: 'standard',
      cost: { input: 1.0, output: 2.0 },
    }

    let sourceAFail = false
    const sourceA: CatalogSource = {
      id: 'source-a',
      discover: async () => {
        if (sourceAFail) return { ok: false, error: 'Source A unavailable' }
        return { ok: true, models: [modelA] }
      },
      refresh: async () => {},
    }
    const sourceB = createSource('source-b', [
      { id: 'provider-b/model-b', owner: 'provider-b', tier: 'standard', cost: { input: 1.0, output: 2.0 } }
    ])

    service = new ModelCatalogService({
      sources: [sourceA, sourceB],
      mergeStrategy: 'precedence',
      sourcePrecedence: ['source-a', 'source-b'],
    })

    await service.refresh()
    expect(service.getSourceSnapshot('source-a')?.status).toBe('healthy')

    sourceAFail = true
    await service.refresh()
    expect(service.getSourceSnapshot('source-a')?.status).toBe('unhealthy')

    sourceAFail = false
    await service.refresh()
    expect(service.getSourceSnapshot('source-a')?.status).toBe('healthy')
    expect(service.isSupported('provider-a/model-a')).toBe(true)
  })
})
