// src/index.ts — Server entry point
// Initializes OpenTelemetry tracing BEFORE importing anything else,
// then starts Fastify with graceful shutdown handling

import './instrumentation.js'   // OTel must be first
import { buildApp } from './app.js'
import { logger } from './utils/logger.js'
import { closeDb } from './clients/db.js'
import { closeRedis } from './clients/redis.js'
import { closeClickhouse } from './clients/clickhouse.js'

const PORT = parseInt(process.env['PORT'] ?? '3000')
const HOST = '0.0.0.0'

async function main(): Promise<void> {
  const app = await buildApp()

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down gracefully...')
    try {
      await app.close()
      await Promise.all([closeDb(), closeRedis(), closeClickhouse()])
      logger.info('Shutdown complete')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT',  () => void shutdown('SIGINT'))

  // Handle uncaught errors (don't crash in production)
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    if (process.env['NODE_ENV'] !== 'production') process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection')
    if (process.env['NODE_ENV'] !== 'production') process.exit(1)
  })

  await app.listen({ port: PORT, host: HOST })
  logger.info({
    port: PORT,
    env: process.env['NODE_ENV'],
    nodeVersion: process.version,
  }, `TokenSentry API running at http://${HOST}:${PORT}`)
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server')
  process.exit(1)
})
