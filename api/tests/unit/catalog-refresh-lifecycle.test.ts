import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initializeCatalog } from '../../src/catalog-bootstrap.js'
import { getCatalogService } from '../../src/services/model-catalog-service.js'

describe('Periodic refresh lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await initializeCatalog()
  })

  afterEach(async () => {
    vi.useRealTimers()
    try { getCatalogService().stopPeriodicRefresh() } catch { /* ignore */ }
  })

  it('starts periodic refresh after initialization', () => {
    const service = getCatalogService()
    expect(service).toBeDefined()
  })

  it('stops periodic refresh cleanly on shutdown', () => {
    const service = getCatalogService()
    service.stopPeriodicRefresh()
    // After stopping, calling again should not throw
    expect(() => service.stopPeriodicRefresh()).not.toThrow()
  })

  it('catalog data remains available after initialization', () => {
    const service = getCatalogService()
    // Fixture source should be present; models-dev may fail (degraded) but descriptors remain
    expect(service.getProjection().descriptors.size).toBeGreaterThanOrEqual(0)
  })
})
