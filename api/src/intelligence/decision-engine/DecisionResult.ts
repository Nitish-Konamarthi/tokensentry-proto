export interface DecisionResult {
  statusCode: number
  headers?: Record<string, string>
  body?: unknown
  streamHandler?: (reply: import('fastify').FastifyReply) => Promise<void>
}
