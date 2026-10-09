import { describe, it, expect } from 'vitest'
import { ModelCatalogService, setCatalogService } from '../../src/services/model-catalog-service.js'
import type { CatalogSource, ModelDescriptor } from '../../src/services/model-catalog.js'

describe('Catalog metadata validation', () => {
  function createCatalogSource(id: string, descriptors: ModelDescriptor[]): CatalogSource {
    return {
      id,
      discover: async () => ({ ok: true, models: descriptors }),
      refresh: async () => {},
    }
  }

  it('accepts valid tier union', async () => {
    const validDescriptor: ModelDescriptor = {
      id: 'valid/model',
      owner: 'provider',
      tier: 'high',
      cost: { input: 1, output: 2 },
    }
    const service = new ModelCatalogService({
      sources: [createCatalogSource('valid', [validDescriptor])],
    })
    setCatalogService(service)
    await service.refresh()
    expect(service.isSupported('valid/model')).toBe(true)
    expect(service.getDescriptor('valid/model')?.tier).toBe('high')
  })

  it('unknown model without route fails safely', () => {
    const service = new ModelCatalogService({ sources: [] })
    setCatalogService(service)
    expect(service.isSupported('unknown/model')).toBe(false)
  })
})
