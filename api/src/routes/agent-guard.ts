import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { agentGuardService } from '../services/agent-guard.js'
import { agentGuardRepo } from '../repositories/agent-guard.js'
import { requireAdmin } from '../middleware/auth-admin.js'

export async function agentGuardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/agents', {
    preHandler: [requireApiKey],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext

    const sessions = await agentGuardService.listActiveSessions(ctx.orgId)
    const dbSessions = await agentGuardRepo.getActiveSessions(ctx.orgId)

    const merged = new Map<string, any>()

    for (const s of sessions) {
      merged.set(s.id, s)
    }

    for (const s of dbSessions) {
      const existing = merged.get(s.sessionId)
      if (existing) {
        existing.loopDetected = s.loopDetected || existing.riskScore > 70
        existing.tokenBudget = s.tokenBudget
      } else {
        merged.set(s.sessionId, {
          id: s.sessionId,
          agentId: s.agentId,
          status: s.status,
          turnCount: s.turnCount,
          tokensConsumed: s.tokensConsumed,
          tokenBudget: s.tokenBudget,
          loopDetected: s.loopDetected,
          riskScore: s.riskScore ?? 0,
          startedAt: s.startedAt.toISOString(),
          terminatedAt: s.terminatedAt?.toISOString() ?? null,
        })
      }
    }

    return reply.send(Array.from(merged.values()))
  })

  fastify.post('/v1/agents/:sessionId/terminate', {
    preHandler: [requireApiKey, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string }
    const ctx = request.authContext
    const session = await agentGuardService.getSession(sessionId, ctx.orgId)
    if (!session || session.orgId !== ctx.orgId) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Agent session not found' })
    }

    await agentGuardService.removeSession(sessionId, ctx.orgId)
    await agentGuardRepo.terminateSession(ctx.orgId, sessionId)

    return reply.send({
      success: true,
      session_id: sessionId,
      terminated_at: new Date().toISOString(),
    })
  })

  fastify.get('/v1/agents/guard-events', {
    preHandler: [requireApiKey],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const events = await agentGuardRepo.getGuardEvents(ctx.orgId)
    return reply.send(events)
  })
}
