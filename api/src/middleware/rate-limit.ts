import type { FastifyRequest, FastifyReply } from 'fastify'
import { rateLimiter } from '../services/rate-limiter.js'
import { env } from '../config/env.js'
import { extractClientIp } from '../lib/ip.js'

export async function proxyRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const key = request.authContext?.orgId ?? extractClientIp(request) ?? 'unknown'

  const result = await rateLimiter.check(key, {
    window_ms: 60_000,
    max_requests: env.RATE_LIMIT_PROXY_ORG,
  })

  reply.header('X-RateLimit-Limit', env.RATE_LIMIT_PROXY_ORG)
  reply.header('X-RateLimit-Remaining', result.remaining)
  reply.header('X-RateLimit-Reset', String(Date.now() + result.resetMs))

  if (!result.allowed) {
    return reply.code(429).send({
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.',
      retry_after_ms: result.resetMs,
    })
  }
}
