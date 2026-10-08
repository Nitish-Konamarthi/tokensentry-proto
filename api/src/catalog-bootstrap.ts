import { setCatalogService, ModelCatalogService, ModelCatalogServiceConfig } from './services/model-catalog-service.js'
import { FixtureCatalogSource } from './services/fixture-catalog-source.js'
import { ModelsDevCatalogSource } from './catalog-sources/models-dev-source.js'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'

export async function initializeCatalog(): Promise<void> {
  const sources: import('./services/model-catalog.js').CatalogSource[] = []

  if (env.MODELS_DEV_API_URL) {
    sources.push(new ModelsDevCatalogSource())
  }

  sources.push(new FixtureCatalogSource())

  const config: ModelCatalogServiceConfig = {
    sources,
    mergeStrategy: 'precedence',
    sourcePrecedence: env.MODELS_DEV_API_URL ? ['models-dev', 'fixture'] : ['fixture'],
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

  const health = service.getCatalogHealth()
  logger.info({
    sources: sources.map(s => s.id),
    descriptors: service.listSupported().length,
    health,
  }, 'Catalog service ready')
}
