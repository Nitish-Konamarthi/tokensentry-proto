// src/routes/agents.ts — Agentic Guard API
import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireApiKey } from '../middleware/auth.js'
import { agenticGuard } from '../pillars/guard.js'
import { pg } from '../clients/db.js'

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/agents/:agentId/check', {
    preHandler: requireApiKey,
    schema: {
      params: Type.Object({ agentId: Type.String() }),
      body: Type.Object({
        total_tokens_consumed: Type.Number({ minimum: 0 }),
        token_budget: Type.Number({ minimum: 1 }),
        turn_count: Type.Number({ minimum: 0 }),
        last_turn_content: Type.String({ maxLength: 5000 }),
        task_description: Type.Optional(Type.String({ maxLength: 1000 })),
        time_elapsed_seconds: Type.Optional(Type.Number()),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const { agentId } = request.params as { agentId: string }
    const body = request.body as {
      total_tokens_consumed: number; token_budget: number
      turn_count: number; last_turn_content: string
      task_description?: string; time_elapsed_seconds?: number
    }

    const result = await agenticGuard.checkTurn({
      agentId,
      orgId: ctx.orgId,
      totalTokensConsumed: body.total_tokens_consumed,
      tokenBudget: body.token_budget,
      turnCount: body.turn_count,
      lastTurnContent: body.last_turn_content,
      currentTaskDescription: body.task_description ?? 'Unknown task',
      timeElapsedSeconds: body.time_elapsed_seconds ?? 0,
    })

    void agenticGuard.recordTurnSummary(agentId, body.last_turn_content.slice(0, 200))

    if (result.terminationRequired) {
      void pg`
        UPDATE agent_sessions
        SET status = 'terminated',
            termination_reason = ${result.guardResult.reason},
            loop_detected = ${result.loopDetected},
            terminated_at = NOW()
        WHERE agent_id = ${agentId} AND org_id = ${ctx.orgId}
      `
    }

    return reply.send({
      agent_id: agentId,
      ...result.guardResult,
      loop_detected: result.loopDetected,
      loop_signature: result.loopSignature,
      termination_required: result.terminationRequired,
      checked_at: new Date().toISOString(),
    })
  })

  fastify.post('/v1/agents/:agentId/register', {
    preHandler: requireApiKey,
    schema: {
      params: Type.Object({ agentId: Type.String() }),
      body: Type.Object({
        task_description: Type.String({ maxLength: 1000 }),
        token_budget: Type.Number({ minimum: 1000 }),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const { agentId } = request.params as { agentId: string }
    const body = request.body as { task_description: string; token_budget: number }

    await pg`
      INSERT INTO agent_sessions (org_id, team_id, user_id, agent_id, task_description, token_budget)
      VALUES (${ctx.orgId}, ${ctx.teamId}, ${ctx.userId}, ${agentId}, ${body.task_description}, ${body.token_budget})
      ON CONFLICT (agent_id) DO UPDATE SET
        status = 'active', token_budget = EXCLUDED.token_budget,
        tokens_consumed = 0, turn_count = 0, started_at = NOW()
    `

    return reply.code(201).send({
      agent_id: agentId,
      token_budget: body.token_budget,
      status: 'active',
      registered_at: new Date().toISOString(),
    })
  })
}
