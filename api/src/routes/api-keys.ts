import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { apiKeyRepo } from '../repositories/api-key.js'
import { auditLogRepo } from '../repositories/audit-log.js'
import { generateApiKey } from '../lib/crypto.js'
import { extractClientIp } from '../lib/ip.js'

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/api-keys', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const keys = await apiKeyRepo.findByOrg(ctx.orgId)

    return keys.map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes,
      created_at: k.createdAt?.toISOString(),
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      revoked: k.revokedAt !== null,
      expires_at: k.expiresAt?.toISOString() ?? null,
    }))
  })

  fastify.post('/v1/api-keys', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as { name: string; expires_in_days?: number }

    if (!body.name || body.name.length < 1) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'name is required' })
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey()

    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400_000)
      : undefined

    const key = await apiKeyRepo.create({
      orgId: ctx.orgId,
      teamId: ctx.teamId,
      userId: ctx.userId,
      keyHash,
      keyPrefix,
      name: body.name,
      expiresAt,
    })

    await auditLogRepo.insert({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: 'api_key.created',
      resource: `api_key:${key.id}`,
      ip: extractClientIp(request),
    })

    return {
      id: key.id,
      name: key.name,
      key: rawKey,
      created_at: key.createdAt?.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
    }
  })

  fastify.delete('/v1/api-keys/:keyId', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const { keyId } = request.params as { keyId: string }

    const revoked = await apiKeyRepo.revoke(keyId)
    if (!revoked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'API key not found' })
    }

    await auditLogRepo.insert({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: 'api_key.revoked',
      resource: `api_key:${keyId}`,
      ip: extractClientIp(request),
    })

    return { success: true, revoked_at: revoked.revokedAt?.toISOString() }
  })
}
