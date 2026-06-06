// src/routes/apikeys.ts — API Key Management
import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { requireApiKey } from '../middleware/auth.js'
import { pg } from '../clients/db.js'
import { redis, RedisKeys } from '../clients/redis.js'
import { generateApiKey } from '../utils/crypto.js'

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/api-keys', {
    preHandler: requireApiKey,
    schema: {
      body: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 100 }),
        scopes: Type.Optional(Type.Array(Type.String())),
        team_id: Type.Optional(Type.String()),
        expires_at: Type.Optional(Type.String()),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    if (!['owner', 'admin'].includes(ctx.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Only owners and admins can create API keys' })
    }

    const body = request.body as {
      name: string; scopes?: string[]; team_id?: string; expires_at?: string
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    const scopes = body.scopes ?? ['ai:proxy']

    await pg`
      INSERT INTO api_keys (org_id, team_id, key_hash, key_prefix, name, scopes, expires_at)
      VALUES (${ctx.orgId}, ${body.team_id ?? null}, ${keyHash}, ${keyPrefix}, ${body.name}, ${scopes}, ${body.expires_at ?? null})
    `

    return reply.code(201).send({
      key: rawKey,
      prefix: keyPrefix,
      name: body.name,
      scopes,
      warning: 'This is the only time you will see this key. Store it securely.',
    })
  })

  fastify.get('/v1/api-keys', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext

    const keys = await pg<Array<{
      id: string; key_prefix: string; name: string; scopes: string[]
      created_at: string; last_used_at: string | null
      expires_at: string | null; revoked_at: string | null
    }>>`
      SELECT id, key_prefix, name, scopes, created_at, last_used_at, expires_at, revoked_at
      FROM api_keys
      WHERE org_id = ${ctx.orgId} AND revoked_at IS NULL
      ORDER BY created_at DESC
    `

    return reply.send({ keys })
  })

  fastify.delete('/v1/api-keys/:keyId', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const { keyId } = request.params as { keyId: string }

    if (!['owner', 'admin'].includes(ctx.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    await pg`
      UPDATE api_keys SET revoked_at = NOW(), revoke_reason = 'user_revoked'
      WHERE id = ${keyId} AND org_id = ${ctx.orgId}
    `

    await redis.del(RedisKeys.authApiKey(keyId.slice(0, 16)))

    return reply.send({ revoked: true, key_id: keyId })
  })
}
