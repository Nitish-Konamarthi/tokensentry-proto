import { setCatalogService, ModelCatalogService, ModelCatalogServiceConfig } from './services/model-catalog-service.js'
import { FixtureCatalogSource } from './services/fixture-catalog-source.js'
import { logger } from './lib/logger.js'

export async function initializeCatalog(): Promise<void> {
  // V1 uses an explicit, version-controlled registry. Governance must not
  // depend on a live third-party catalog or refresh timing.
  const sources: import('./services/model-catalog.js').CatalogSource[] = [new FixtureCatalogSource()]

  const config: ModelCatalogServiceConfig = {
    sources,
    mergeStrategy: 'precedence',
    sourcePrecedence: ['fixture'],
  }

  const service = new ModelCatalogService(config)

  await service.refresh()
  if (service.listSupported().length === 0) {
    throw new Error('The V1 model catalog is empty or invalid')
  }
  const health = service.getCatalogHealth()
  logger.info({ sources: sources.map(s => s.id), descriptors: service.listSupported().length, health }, 'Catalog service initialized')

  setCatalogService(service)
}
