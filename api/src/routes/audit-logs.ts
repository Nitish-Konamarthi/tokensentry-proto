import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { auditLogRepo } from '../repositories/audit-log.js'
import { requireAdmin } from '../middleware/auth-admin.js'

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/audit-logs', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const query = request.query as { limit?: string; action?: string }
    const requestedLimit = Number(query.limit ?? 50)
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'limit must be an integer between 1 and 200' })
    }
    const limit = requestedLimit

    let logs: Awaited<ReturnType<typeof auditLogRepo.findByOrg>>
    if (query.action && query.action !== 'all') {
      logs = await auditLogRepo.findFiltered(ctx.orgId, query.action, limit)
    } else {
      logs = await auditLogRepo.findByOrg(ctx.orgId, limit)
    }

    return logs.map(l => ({
      id: l.id,
      actor_id: l.actorId,
      action: l.action,
      resource: l.resource,
      details: l.details,
      ip: l.ip,
      created_at: l.createdAt?.toISOString(),
    }))
  })
}
