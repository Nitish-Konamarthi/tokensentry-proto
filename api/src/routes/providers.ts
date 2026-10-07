import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { getValkey } from '../clients/valkey.js'
import { encrypt } from '../lib/crypto.js'

const PROVIDER_KEYS_PREFIX = 'provider:keys:'

export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/providers/health', { preHandler: requireApiKey }, async (request: FastifyRequest) => {
    const ctx = request.authContext
    const valkey = getValkey()
    const keys = await valkey.hgetall(`${PROVIDER_KEYS_PREFIX}${ctx.orgId}`)
    const configuredProviders = keys ? Object.keys(keys) : []

    return {
      providers: [
        { provider: 'anthropic', name: 'Anthropic', configured: configuredProviders.includes('anthropic') },
        { provider: 'openai', name: 'OpenAI', configured: configuredProviders.includes('openai') },
        { provider: 'gemini', name: 'Gemini', configured: configuredProviders.includes('gemini') },
        { provider: 'groq', name: 'Groq', configured: configuredProviders.includes('groq') },
        { provider: 'openrouter', name: 'OpenRouter', configured: configuredProviders.includes('openrouter') },
      ],
    }
  })

  fastify.put('/v1/providers/keys', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as Record<string, string | undefined>
    const validProviders = ['anthropic', 'openai', 'gemini', 'groq', 'openrouter']
    const toStore: Record<string, string> = {}

    for (const provider of validProviders) {
      const key = body[provider]
      if (key && typeof key === 'string' && key.length > 0) {
        toStore[provider] = encrypt(key)
      }
    }

    if (Object.keys(toStore).length === 0) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'No valid provider keys provided' })
    }

    const valkey = getValkey()
    await valkey.hset(`${PROVIDER_KEYS_PREFIX}${ctx.orgId}`, toStore)

    return { success: true, updated: Object.keys(toStore) }
  })
}
