import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { agentGuardService } from '../services/agent-guard.js'
import { agentGuardRepo } from '../repositories/agent-guard.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { logger } from '../lib/logger.js'

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
    const storedSession = await agentGuardRepo.findSession(ctx.orgId, sessionId)
    if (storedSession?.status === 'terminated') {
      return reply.send({
        success: true,
        session_id: sessionId,
        terminated_at: storedSession.terminatedAt?.toISOString() ?? new Date().toISOString(),
      })
    }

    // Sessions can be present only in Valkey until a warning/block is recorded.
    // Conversely, PostgreSQL may retain a session after its Valkey TTL expired.
    const session = storedSession ? null : await agentGuardService.getSession(sessionId, ctx.orgId)
    if (!storedSession && (!session || session.orgId !== ctx.orgId)) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Agent session not found' })
    }

    if (!storedSession && session) {
      const stats = await agentGuardService.getStats(sessionId, ctx.orgId)
      await agentGuardRepo.upsertSession({
        orgId: ctx.orgId,
        agentId: session.agentId,
        sessionId,
        turnCount: stats.requestCount,
        tokensConsumed: stats.inputTokens + stats.outputTokens,
        riskScore: 100,
        action: 'block',
      })
    }
    const terminated = await agentGuardRepo.terminateSession(ctx.orgId, sessionId)
    if (!terminated) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Agent session not found' })
    }
    try {
      await agentGuardService.setBlocked(sessionId, ctx.orgId)
    } catch (err) {
      // PostgreSQL is the durable termination authority. A Valkey outage must
      // not undo an already-persisted administrative termination.
      logger.warn({ err, orgId: ctx.orgId, sessionId }, 'Valkey block cache unavailable after session termination')
    }

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
