import { setCatalogService, ModelCatalogService, ModelCatalogServiceConfig } from './services/model-catalog-service.js'
import { FixtureCatalogSource } from './services/fixture-catalog-source.js'
import { ModelsDevCatalogSource } from './catalog-sources/models-dev-source.js'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'

export async function initializeCatalog(): Promise<void> {
  const sources: import('./services/model-catalog.js').CatalogSource[] = []

  // Production uses the real Models.dev source (with its default URL)
  sources.push(new ModelsDevCatalogSource())

  // Fixture catalog is ONLY for development/test environments
  // Production must explicitly enable it via env var
  if (env.NODE_ENV !== 'production' || env.ENABLE_FIXTURE_CATALOG === 'true') {
    sources.push(new FixtureCatalogSource())
    logger.info({ env: env.NODE_ENV }, 'Fixture catalog source enabled (dev/test mode)')
  } else {
    logger.info({ env: env.NODE_ENV }, 'Fixture catalog source disabled (production mode)')
  }

  if (sources.length === 0) {
    logger.warn('No catalog sources configured - catalog will be empty until sources are configured')
  }

  const config: ModelCatalogServiceConfig = {
    sources,
    mergeStrategy: 'precedence',
    sourcePrecedence: ['models-dev', 'fixture'],
  }

  const service = new ModelCatalogService(config)

  try {
    await service.refresh()
    const health = service.getCatalogHealth()
    logger.info({
      sources: sources.map(s => s.id),
      descriptors: service.listSupported().length,
      health,
    }, 'Catalog service initialized')
  } catch (err) {
    logger.warn({ err }, 'Initial catalog refresh failed, using previous/empty projection')
  }

  setCatalogService(service)
  service.startPeriodicRefresh()

  const health = service.getCatalogHealth()
  logger.info({
    sources: sources.map(s => s.id),
    descriptors: service.listSupported().length,
    health,
  }, 'Catalog service ready')
}
