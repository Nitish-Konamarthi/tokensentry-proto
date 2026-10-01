import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const role = request.authContext?.role
  if (role !== 'owner' && role !== 'admin') {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin or owner role required' })
  }
}
