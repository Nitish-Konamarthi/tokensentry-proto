import type { AuthContext, ProxyRequest } from '../../types/index.js'

export interface DecisionContext {
  authContext: AuthContext
  body: ProxyRequest
  callId: string
  startTime: number
  teamId?: string
  userId?: string
  agentId?: string
  sessionId?: string
}

export interface DecisionResult {
  statusCode: number
  headers?: Record<string, string>
  body?: unknown
  streamHandler?: (reply: import('fastify').FastifyReply) => Promise<void>
}
