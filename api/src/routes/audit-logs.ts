import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { auditLogRepo } from '../repositories/audit-log.js'

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/audit-logs', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const query = request.query as { limit?: string; action?: string }
    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200)

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
