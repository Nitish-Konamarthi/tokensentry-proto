import { setCatalogService, ModelCatalogService, ModelCatalogServiceConfig } from './services/model-catalog-service.js'
import { FixtureCatalogSource } from './services/fixture-catalog-source.js'
import { ModelsDevCatalogSource } from './catalog-sources/models-dev-source.js'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'

/**
 * Production catalog bootstrap - the ONLY production initialization path.
 * 
 * The production runtime uses external catalog sources when configured,
 * with the fixture source as a safe fallback for development.
 * 
 * Never uses LegacyCatalogSource as the production default.
 */
export async function initializeCatalog(): Promise<void> {
  const sources: import('./services/model-catalog.js').CatalogSource[] = []

  // External catalog sources (configured via environment)
  if (env.MODELS_DEV_API_URL) {
    sources.push(new ModelsDevCatalogSource())
  }
  
  // Note: OpenCode does not provide a standalone public model-catalog API.
  // Models.dev is the authoritative external catalog source.
  // If OpenCode provides a supported public mechanism in the future, add it here.

  // Fixture source provides a safe baseline for local development.
  // It is included at lower precedence so external sources override where configured.
  sources.push(new FixtureCatalogSource())

  // If NO external sources configured and we are in production, we must NOT fall back to legacy registry.
  // The fixture source provides the minimum safe model set.
  
  // Re-instantiate the service with production sources
  const config: ModelCatalogServiceConfig = {
    sources,
    mergeStrategy: 'precedence',
    sourcePrecedence: env.MODELS_DEV_API_URL ? ['models-dev', 'fixture'] : ['fixture'],
  }

  // Update the production singleton
  const service = new ModelCatalogService(config)
  
  // Initialize with a first refresh to populate projection
  try {
    await service.refresh()
    logger.info({ sources: sources.map(s => s.id), descriptors: service.listSupported().length }, 'Catalog service initialized')
  } catch (err) {
    logger.warn({ err }, 'Initial catalog refresh failed, using previous/empty projection')
    // Projection remains empty until refresh succeeds - failure tolerant
  }

  // Wire the singleton
  setCatalogService(service)
  
  logger.info({ sources: sources.map(s => s.id), descriptors: service.listSupported().length }, 'Catalog service ready')
}
