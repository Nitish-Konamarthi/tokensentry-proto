import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../services/auth.js'
import { extractClientIp } from '../lib/ip.js'
import { logger } from '../lib/logger.js'

export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authorization header required: Bearer ts_live_xxx' })
  }

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey.startsWith('ts_')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid API key format' })
  }

  if (rawKey.length < 20 || rawKey.length > 80) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid API key format' })
  }

  try {
    const ip = extractClientIp(request)
    const ctx = await authService.authenticateApiKey(rawKey, ip)
    request.authContext = ctx
  } catch (err) {
    logger.warn({ ip: extractClientIp(request), path: request.url }, 'Auth failed')
    const invalidKey = (err as Error).message === 'INVALID_API_KEY'
    const message = invalidKey
      ? 'Invalid or revoked API key'
      : 'Authentication service unavailable'
    return reply.code(invalidKey ? 401 : 503).send({ error: invalidKey ? 'UNAUTHORIZED' : 'AUTH_UNAVAILABLE', message })
  }
}

export async function requireProxyScope(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authContext?.scopes?.includes('proxy')) {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'API key lacks the proxy scope' })
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization']
  if (!authHeader?.startsWith('Bearer ts_')) return

  try {
    const ip = extractClientIp(request)
    const ctx = await authService.authenticateApiKey(authHeader.slice(7).trim(), ip)
    request.authContext = ctx
  } catch (err) {
    // Log infrastructure/auth failures but do not block; optional auth is best-effort
    logger.warn({ err, ip: extractClientIp(request), path: request.url }, 'optionalAuth failed')
  }
}
