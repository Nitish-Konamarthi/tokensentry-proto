import { describe, it, expect, beforeEach } from 'vitest'
import { ModelCatalogService } from '../../src/services/model-catalog-service.js'
import type { CatalogSource, ModelDescriptor } from '../../src/services/model-catalog.js'

function createSource(id: string, models: ModelDescriptor[], opts?: { fail?: boolean }): CatalogSource {
  return {
    id,
    discover: async () => (opts?.fail ? { ok: false, error: 'down' } : { ok: true, models }),
    refresh: async () => {},
  }
}

describe('Catalog health reporting', () => {
  let service: ModelCatalogService

  beforeEach(() => {
    service = new ModelCatalogService({ sources: [], mergeStrategy: 'precedence', sourcePrecedence: [] })
  })

  it('reports unavailable when no sources configured', () => {
    expect(service.getCatalogHealth()).toBe('unavailable')
  })

  it('reports degraded when some sources fail but previous data remains', async () => {
    const sourceA = createSource('a', [{ id: 'm1', owner: 'o1', tier: 'standard', cost: { input: 1, output: 1 } }])
    const sourceB = createSource('b', [], { fail: true })
    service = new ModelCatalogService({ sources: [sourceA, sourceB], mergeStrategy: 'precedence', sourcePrecedence: ['a', 'b'] })
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('degraded')
    expect(service.listSupported()).toContain('m1')
  })

  it('reports unavailable when all fail with no previous data', async () => {
    const sourceA = createSource('a', [], { fail: true })
    service = new ModelCatalogService({ sources: [sourceA], mergeStrategy: 'precedence', sourcePrecedence: ['a'] })
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('unavailable')
  })

  it('recovers to healthy after failure', async () => {
    const modelA: ModelDescriptor = { id: 'm1', owner: 'o1', tier: 'standard', cost: { input: 1, output: 1 } }
    let fail = false
    const sourceA: CatalogSource = {
      id: 'a',
      discover: async () => (fail ? { ok: false, error: 'down' } : { ok: true, models: [modelA] }),
      refresh: async () => {},
    }
    service = new ModelCatalogService({ sources: [sourceA], mergeStrategy: 'precedence', sourcePrecedence: ['a'] })
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('healthy')
    fail = true
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('degraded')
    fail = false
    await service.refresh()
    expect(service.getCatalogHealth()).toBe('healthy')
  })
})
