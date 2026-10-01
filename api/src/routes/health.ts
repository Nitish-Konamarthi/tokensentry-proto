import type { FastifyInstance } from 'fastify'
import { checkPgHealth } from '../clients/postgres.js'
import { checkValkeyHealth } from '../clients/valkey.js'

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health/live', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }))

  fastify.get('/health/ready', async () => {
    const [db, valkey] = await Promise.all([checkPgHealth(), checkValkeyHealth()])

    if (!db && !valkey) {
      return { status: 'degraded', database: 'down', valkey: 'down' }
    }
    if (!db) {
      return { status: 'degraded', database: 'down', valkey: valkey ? 'ok' : 'down' }
    }
    if (!valkey) {
      return { status: 'degraded', database: db ? 'ok' : 'down', valkey: 'down' }
    }

    return { status: 'ok', database: 'ok', valkey: 'ok' }
  })
}
