import Fastify, { type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import { randomUUID } from 'node:crypto'
import { logger } from './lib/logger.js'
import { env } from './config/env.js'
import { registerErrorHandler } from './middleware/error-handler.js'

import { healthRoutes } from './routes/health.js'
import { proxyRoutes } from './routes/proxy.js'
import { budgetRoutes } from './routes/budgets.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { analyticsRoutes } from './routes/analytics.js'
import { agentGuardRoutes } from './routes/agent-guard.js'
import { auditLogRoutes } from './routes/audit-logs.js'
import { providerRoutes } from './routes/providers.js'
import { settingsRoutes } from './routes/settings.js'
import { teamRoutes } from './routes/team.js'

export async function buildApp(): Promise<FastifyInstance> {
  const trustedProxies = env.TRUSTED_PROXY_CIDRS.split(',').map(s => s.trim()).filter(Boolean)
  const app = Fastify({
    logger: false,
    trustProxy: trustedProxies.length > 0 ? trustedProxies : false,
    genReqId: () => randomUUID(),
    bodyLimit: 10 * 1024 * 1024,
  })

  app.decorateRequest('callId', '')

  // Plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return }
      const allowed = /^https:\/\/[a-z0-9-]+\.tokensentry\.ai$/.test(origin)
        || env.NODE_ENV !== 'production' && (
          origin === 'http://localhost:3000' || origin === 'http://localhost:3001'
        )
      cb(null, allowed)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-TS-Team-Id', 'X-TS-User-Id', 'X-TS-Agent-Id', 'X-TS-Session-Id'],
    credentials: true,
  })

  await app.register(sensible)

  // Request logging
  app.addHook('onRequest', async (request, reply) => {
    request.callId = randomUUID()
    reply.header('x-call-id', request.callId)
    logger.info({
      method: request.method,
      url: request.url,
      requestId: request.id,
      ip: request.socket.remoteAddress,
    }, 'Request received')
  })

  // Every JSON error uses the same correlation id as the response header. This
  // also covers failures that occur before a route handler runs (for example,
  // schema validation and authentication middleware).
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 400 || typeof payload !== 'string') return payload

    try {
      const body = JSON.parse(payload) as Record<string, unknown>
      if (typeof body.error !== 'string' || typeof body.call_id === 'string') return payload
      return JSON.stringify({ ...body, call_id: request.callId })
    } catch {
      return payload
    }
  })

  app.addHook('onResponse', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      requestId: request.id,
    }, 'Request completed')
  })

  // Error handler (must be after hooks)
  registerErrorHandler(app)

  // Routes
  await app.register(healthRoutes)
  await app.register(proxyRoutes)
  await app.register(budgetRoutes)
  await app.register(apiKeyRoutes)
  await app.register(analyticsRoutes)
  await app.register(agentGuardRoutes)
  await app.register(auditLogRoutes)
  await app.register(providerRoutes)
  await app.register(settingsRoutes)
  await app.register(teamRoutes)

  return app
}
