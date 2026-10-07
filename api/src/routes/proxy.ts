import { logger } from '../lib/logger.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { proxyRateLimit } from '../middleware/rate-limit.js'
import { proxyRequestBodySchema } from '../validators/proxy.js'
import { createRequestContext } from '../intelligence/request-context.js'
import { decisionEngine } from '../intelligence/decision-engine/DecisionEngine.js'

interface ProxyBody {
  model: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  system?: string
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

export async function proxyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/proxy', {
    preHandler: [requireApiKey, proxyRateLimit],
    schema: { body: proxyRequestBodySchema },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const callId = request.callId
    const startTime = Date.now()
    const body = request.body as ProxyBody
    const authContext = request.authContext

    const teamId = (request.headers['x-ts-team-id'] as string) || authContext.teamId
    const userId = (request.headers['x-ts-user-id'] as string) || authContext.userId
    const agentId = (request.headers['x-ts-agent-id'] as string) || undefined
    const sessionId = (request.headers['x-ts-session-id'] as string) || undefined

    const requestContext = createRequestContext({
      requestId: callId,
      apiKey: authContext.keyId,
      organizationId: authContext.orgId,
      teamId,
      userId,
      userRole: authContext.role,
      body,
      receivedAt: startTime,
      agentId,
      sessionId,
    })

    reply.header('x-call-id', callId)

    try {
      const decision = await decisionEngine.decide(requestContext)

      if (decision.headers) {
        for (const [key, value] of Object.entries(decision.headers)) {
          reply.header(key, value)
        }
      }

      if (decision.streamHandler) {
        await decision.streamHandler(reply)
        return
      }

      return reply.code(decision.statusCode).send(decision.body)
    } catch (err) {
      logger.error({ err, callId }, 'Proxy error - unexpected failure')
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        call_id: callId,
      })
    }
  })
}
