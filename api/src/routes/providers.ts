import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { env } from '../config/env.js'

export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/providers/health', { preHandler: requireApiKey }, async (request: FastifyRequest) => {
    return {
      providers: [
        { provider: 'anthropic', name: 'Anthropic', configured: Boolean(env.ANTHROPIC_API_KEY) },
        { provider: 'openai', name: 'OpenAI', configured: Boolean(env.OPENAI_API_KEY) },
        { provider: 'gemini', name: 'Gemini', configured: Boolean(env.GEMINI_API_KEY) },
        { provider: 'groq', name: 'Groq', configured: Boolean(env.GROQ_API_KEY) },
        { provider: 'openrouter', name: 'OpenRouter', configured: Boolean(env.OPENROUTER_API_KEY) },
      ],
    }
  })
}
