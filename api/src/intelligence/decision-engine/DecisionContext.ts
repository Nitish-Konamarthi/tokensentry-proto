import type { AuthContext, ProxyRequest } from '../../types/index.js'

export interface DecisionContext {
  authContext: AuthContext
  body: ProxyRequest
  callId: string
  startTime: number
  teamId: string
  userId: string
  agentId?: string
  sessionId?: string
}
