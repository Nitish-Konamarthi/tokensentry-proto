import { describe, it, expect, beforeEach } from 'vitest'
import { initializeCatalog } from '../../src/catalog-bootstrap.js'
import { getCatalogService } from '../../src/services/model-catalog-service.js'

describe('Periodic refresh lifecycle', () => {
  beforeEach(async () => {
    await initializeCatalog()
  })

  it('loads the version-controlled catalog without a refresh timer', () => {
    const service = getCatalogService()
    expect(service.getCatalogHealth()).toBe('healthy')
    expect(service.listSupported()).toContain('anthropic/claude-sonnet-4-6')
  })

  it('catalog data remains available after initialization', () => {
    const service = getCatalogService()
    expect(service.getProjection().descriptors.size).toBeGreaterThan(0)
    expect(service.getCatalogHealth()).toBe('healthy')
  })
})
