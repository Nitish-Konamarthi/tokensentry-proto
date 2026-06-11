// src/app.ts — Fastify application factory
// Security hardening applied:
//   - Rate limiting via @fastify/rate-limit (Redis-backed, per-org + per-IP)
//   - CORS locked down (no localhost in production)
//   - Content-Type validation on mutating routes
//   - Max prompt body size enforced

import Fastify, { type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import { logger } from './utils/logger.js'
import { config } from './utils/config.js'
import { redis } from './clients/redis.js'

// Ensure pg client errors don't crash the process silently
import './clients/db.js'

// Routes
import { healthRoutes }    from './routes/health.js'
import { proxyRoutes }     from './routes/proxy.js'
import { analyticsRoutes } from './routes/analytics.js'
import { advisorRoutes }   from './routes/advisor.js'
import { agentRoutes }     from './routes/agents.js'
import { apiKeyRoutes }    from './routes/apikeys.js'
import { billingRoutes }   from './routes/billing.js'
import { spendRoutes }     from './routes/spend.js'
import { budgetRoutes }    from './routes/budgets.js'
import { onboardingRoutes } from './routes/onboarding.js'
import { proxyOpenAIRoutes } from './routes/proxy-openai.js'
import { proxyGeminiRoutes } from './routes/proxy-gemini.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,       // We use our own pino instance
    trustProxy: true,    // Behind NGINX/Cloudflare — read x-forwarded-for
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    // SECURITY: Max body size for AI prompts (10MB — generous but bounded)
    bodyLimit: 10 * 1024 * 1024,
  })

  // ── Security headers ───────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false,  // Handled by NGINX
    hsts: false,                   // Handled by NGINX/Cloudflare
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  // ── CORS ────────────────────────────────────────────────────
  // SECURITY FIX: localhost origins only allowed in non-production environments
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) { cb(null, true); return }  // curl, server-to-server

      const isProd = config.NODE_ENV === 'production'
      const allowed =
        /^https:\/\/[a-z0-9-]+\.tokensentry\.ai$/.test(origin)   // any *.tokensentry.ai subdomain
        || (!isProd && (
          origin === 'http://localhost:3001' ||   // Local dashboard dev
          origin === 'http://localhost:3000'       // Local API dev
        ))

      cb(null, allowed)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Authorization', 'Content-Type',
      'X-TS-Team-Id', 'X-TS-User-Id',
      'X-TS-Preserve-Priority', 'X-TS-Agent-Budget-Tokens',
    ],
    exposedHeaders: [
      'X-TS-Approved-Model', 'X-TS-Cost-Usd', 'X-TS-Tokens-Saved',
      'X-TS-Cache-Hit', 'X-TS-Reduction-Pct', 'X-TS-Call-Id',
      'X-TS-Original-Model', 'X-Cache',
    ],
    credentials: true,
  })

  // ── Rate Limiting (Redis-backed, survives restarts) ──────────
  // SECURITY FIX: limits request rates to protect against budget exhaustion attacks
  // Global defaults — proxy route overrides with stricter org-level limits
  await app.register(rateLimit, {
    global: true,
    max: 200,           // 200 req per timeWindow per key
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) => {
      // Rate limit by API key prefix if authenticated, else by IP
      const auth = request.headers['authorization']
      if (auth?.startsWith('Bearer ts_')) {
        return `ratelimit:global:${auth.slice(7, 23)}`  // First 16 chars of key
      }
      return `ratelimit:ip:${request.socket.remoteAddress ?? 'unknown'}`
    },
    errorResponseBuilder: () => ({
      error: 'RATE_LIMITED',
      message: 'Too many requests. Slow down.',
      retry_after: '60 seconds',
    }),
  })

  // ── Sensible defaults (error helpers) ───────────────────────
  await app.register(sensible)

  // ── Content-Type validation for mutating routes ─────────────
  // SECURITY FIX: Reject requests without proper Content-Type on POST/PUT/PATCH
  app.addHook('preValidation', async (request, reply) => {
    const method = request.method
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const ct = request.headers['content-type']
      if (ct && !ct.includes('application/json') && !ct.includes('multipart/form-data')) {
        return reply.code(415).send({
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type must be application/json',
        })
      }
    }
  })

  // ── Request logging ─────────────────────────────────────────
  app.addHook('onRequest', async (request) => {
    logger.info({
      method: request.method,
      url: request.url,
      ip: request.socket.remoteAddress,
      requestId: request.id,
      userAgent: request.headers['user-agent']?.slice(0, 100),  // Truncate long UA strings
    }, 'Request received')
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

  // ── Error handler ────────────────────────────────────────────
  app.setErrorHandler((err: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
    const statusCode = err.statusCode ?? 500
    const isProd = config.NODE_ENV === 'production'

    logger.error({
      err: { message: err.message, name: err.name, stack: isProd ? undefined : err.stack },
      requestId: request.id,
      url: request.url,
    }, 'Unhandled error')

    if ('validation' in err && err.validation) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: err.message,
        fields: err.validation,
      })
    }

    // Never leak stack traces or internal error details in production
    return reply.code(statusCode < 600 ? statusCode : 500).send({
      error: isProd ? 'INTERNAL_ERROR' : (err.name ?? 'INTERNAL_ERROR'),
      message: statusCode === 500
        ? 'An unexpected error occurred'
        : err.message,
      request_id: request.id as string,
    })
  })

  // ── Not found handler ────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      docs_url: 'https://docs.tokensentry.ai/api',
    })
  })

  // ── Register all routes ──────────────────────────────────────
  await app.register(healthRoutes)
  await app.register(proxyRoutes)
  await app.register(analyticsRoutes)
  await app.register(advisorRoutes)
  await app.register(agentRoutes)
  await app.register(apiKeyRoutes)
  await app.register(billingRoutes)
  await app.register(spendRoutes)
  await app.register(budgetRoutes)
  await app.register(onboardingRoutes)
  await app.register(proxyOpenAIRoutes, { prefix: '/v1/openai/proxy' })
  await app.register(proxyGeminiRoutes, { prefix: '/v1/gemini/proxy' })

  return app
}
