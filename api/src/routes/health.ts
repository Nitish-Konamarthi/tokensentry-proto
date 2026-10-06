import type { FastifyInstance } from 'fastify'
import { checkPgHealth } from '../clients/postgres.js'
import { checkValkeyHealth } from '../clients/valkey.js'

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health/live', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }))

  fastify.get('/health/ready', async (request, reply) => {
    const [db, valkey] = await Promise.all([checkPgHealth(), checkValkeyHealth()])
    const dbOk = db === true
    const valkeyOk = valkey === true

    if (dbOk && valkeyOk) {
      return reply.code(200).send({ status: 'ok', database: 'ok', valkey: 'ok' })
    }

    // V1 readiness: fail-closed if required dependency unavailable
    return reply.code(503).send({
      status: 'degraded',
      database: dbOk ? 'ok' : 'down',
      valkey: valkeyOk ? 'ok' : 'down',
    })
  })
}
