// src/routes/health.ts
import type { FastifyInstance } from 'fastify'
import { checkDbHealth } from '../clients/db.js'
import { checkRedisHealth } from '../clients/redis.js'
import { checkClickhouseHealth } from '../clients/clickhouse.js'

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Liveness: is the process running?
  fastify.get('/health/live', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Readiness: are all dependencies healthy?
  fastify.get('/health/ready', async (_req, reply) => {
    const [db, redis, clickhouse] = await Promise.allSettled([
      checkDbHealth(),
      checkRedisHealth(),
      checkClickhouseHealth(),
    ])

    const checks = {
      database: db.status === 'fulfilled' && db.value,
      redis:    redis.status === 'fulfilled' && redis.value,
      clickhouse: clickhouse.status === 'fulfilled' && clickhouse.value,
    }

    const allHealthy = Object.values(checks).every(Boolean)

    return reply.code(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    })
  })

  // Simple health for NGINX
  fastify.get('/health', async (_req, reply) => {
    return reply.send('OK')
  })
}
