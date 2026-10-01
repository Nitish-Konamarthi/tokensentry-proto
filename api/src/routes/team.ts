import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { orgRepo } from '../repositories/org.js'
import { auditLogRepo } from '../repositories/audit-log.js'
import { extractClientIp } from '../lib/ip.js'
import { randomUUID } from 'crypto'

export async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/members', { preHandler: requireApiKey }, async (request: FastifyRequest) => {
    const ctx = request.authContext
    const members = await orgRepo.findMembers(ctx.orgId)

    return members.map(m => ({
      id: m.id,
      email: m.email,
      role: m.role,
      joined_at: m.joinedAt?.toISOString(),
      last_active: null,
    }))
  })

  fastify.post('/v1/invitations', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as { email: string; role?: string }

    if (!body.email || !body.email.includes('@')) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Valid email is required' })
    }

    const role = body.role ?? 'member'
    if (!['admin', 'member'].includes(role)) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Role must be "admin" or "member"' })
    }

    const member = await orgRepo.addMember({
      orgId: ctx.orgId,
      userId: randomUUID(),
      role,
      email: body.email,
    })

    await auditLogRepo.insert({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: 'member.invited',
      resource: `member:${member.id}`,
      details: { email: body.email, role } as Record<string, unknown>,
      ip: extractClientIp(request),
    })

    return {
      id: member.id,
      email: member.email,
      role: member.role,
      joined_at: member.joinedAt?.toISOString(),
    }
  })

  fastify.delete('/v1/members/:memberId', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const { memberId } = request.params as { memberId: string }

    const removed = await orgRepo.removeMember(ctx.orgId, memberId)
    if (!removed) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Member not found' })
    }

    await auditLogRepo.insert({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: 'member.removed',
      resource: `member:${memberId}`,
      ip: extractClientIp(request),
    })

    return { success: true }
  })
}
