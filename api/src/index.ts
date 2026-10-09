import './instrumentation.js'
import { buildApp } from './app.js'
import { logger } from './lib/logger.js'
import { closePg } from './clients/postgres.js'
import { closeValkey } from './clients/valkey.js'
import { env } from './config/env.js'
import { initializeCatalog } from './catalog-bootstrap.js'
import { getCatalogService } from './services/model-catalog-service.js'

async function main(): Promise<void> {
  const app = await buildApp()

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down gracefully...')
    try {
      try { getCatalogService().stopPeriodicRefresh() } catch { /* not initialized */ }
      await app.close()
      await Promise.all([closePg(), closeValkey()])
      logger.info('Shutdown complete')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    if (env.NODE_ENV !== 'production') process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection')
    if (env.NODE_ENV !== 'production') process.exit(1)
  })

  // Initialize production catalog with external sources
  await initializeCatalog()

  await app.listen({ port: env.PORT, host: env.HOST })
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'TokenSentry API running')
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server')
  process.exit(1)
})
