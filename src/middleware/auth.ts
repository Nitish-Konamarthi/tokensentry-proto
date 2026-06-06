// src/middleware/auth.ts — Authentication middleware
// Security hardening applied:
//   - Org UUID no longer leaked in response headers (removed x-ts-org-id)
//   - Platform API key fallback removed (customers must configure their own key)
//   - X-Forwarded-For validated against trusted proxy CIDR list
//   - hashApiKey now uses HMAC-SHA256 with server-side pepper

import type { FastifyRequest, FastifyReply } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { pg } from '../clients/db.js'
import { redis, RedisKeys, TTL } from '../clients/redis.js'
import { hashApiKey } from '../utils/crypto.js'
import { logger } from '../utils/logger.js'
import { config } from '../utils/config.js'

export interface AuthContext {
  orgId: string
  teamId: string
  userId: string
  role: string
  plan: 'starter' | 'business' | 'enterprise'
  orgPolicy: {
    allowed_models: string[]
    max_model_tier: 'haiku' | 'sonnet' | 'opus'
    require_classification: boolean
    allow_opus: boolean
  }
  budgetLimits: { user: number; team: number; org: number }
  keyId: string
  anthropicKeyRef: string | null   // null = customer has NOT configured their key
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`)
    )
  }
  return jwks
}

// ── Trusted proxy CIDR validation ───────────────────────────────────────────
// Parse CIDR ranges once at startup for performance
const TRUSTED_CIDRS = config.TRUSTED_PROXY_CIDRS.split(',').map(s => s.trim()).filter(Boolean)

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

function isInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/')
    if (!range || !bits) return false
    const mask = ~(0xffffffff >>> parseInt(bits, 10)) >>> 0
    return (ipToInt(ip) & mask) === (ipToInt(range) & mask)
  } catch {
    return false
  }
}

function isTrustedProxy(ip: string): boolean {
  // localhost is always trusted
  if (ip === '127.0.0.1' || ip === '::1') return true
  return TRUSTED_CIDRS.some(cidr => isInCidr(ip, cidr))
}

// Extract the real client IP, validating the proxy chain
export function extractClientIp(request: FastifyRequest): string {
  const remoteIp = request.socket.remoteAddress ?? '0.0.0.0'

  // Only trust X-Forwarded-For if the direct connection comes from a trusted proxy
  if (isTrustedProxy(remoteIp)) {
    const forwardedFor = request.headers['x-forwarded-for'] as string | undefined
    if (forwardedFor) {
      // X-Forwarded-For: client, proxy1, proxy2  → take leftmost (actual client)
      const clientIp = forwardedFor.split(',')[0]?.trim()
      if (clientIp) return clientIp
    }
  }

  return remoteIp
}

// ── API Key Authentication ──────────────────────────────────────────────────
export async function authenticateApiKey(rawKey: string, ip: string): Promise<AuthContext> {
  const keyHash = hashApiKey(rawKey)
  const cacheKey = RedisKeys.authApiKey(keyHash.slice(0, 16))

  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached) as AuthContext

  const rows = await pg<{
    key_id: string; org_id: string; team_id: string; user_id: string
    scopes: string[]; role: string; plan: string; model_policy: string
    monthly_limit_usd: number; anthropic_key_ref: string | null
    revoked_at: string | null; expires_at: string | null
  }[]>`
    SELECT
      k.id                            AS key_id,
      k.org_id,
      COALESCE(k.team_id::text, '')   AS team_id,
      COALESCE(k.user_id::text, '')   AS user_id,
      k.scopes,
      COALESCE(m.role, 'member')      AS role,
      o.plan,
      o.model_policy::text            AS model_policy,
      COALESCE(bp.monthly_limit_usd, 500) AS monthly_limit_usd,
      o.anthropic_key_ref,
      k.revoked_at,
      k.expires_at
    FROM api_keys k
    JOIN organizations o ON o.id = k.org_id
    LEFT JOIN org_members m ON m.org_id = k.org_id AND m.user_id = k.user_id
    LEFT JOIN budget_policies bp ON bp.org_id = k.org_id
      AND bp.team_id IS NULL AND bp.user_id IS NULL
    WHERE k.key_hash = ${keyHash}
      AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > NOW())
    LIMIT 1
  `

  const row = rows[0]
  if (!row) throw new UnauthorizedError('Invalid or revoked API key')

  const policy = JSON.parse(row.model_policy) as AuthContext['orgPolicy']

  const ctx: AuthContext = {
    orgId: row.org_id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    plan: row.plan as AuthContext['plan'],
    orgPolicy: policy,
    budgetLimits: { user: 0, team: 0, org: Number(row.monthly_limit_usd) },
    keyId: row.key_id,
    // SECURITY FIX: anthropicKeyRef=null means customer has NOT set their key.
    // The proxy route MUST reject calls when this is null (no platform-key fallback).
    anthropicKeyRef: row.anthropic_key_ref ?? null,
  }

  await redis.setex(cacheKey, TTL.AUTH_CACHE_SECONDS, JSON.stringify(ctx))

  // Update last_used_at + IP in background (non-blocking)
  void pg`UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ${ip}::inet WHERE id = ${row.key_id}`

  return ctx
}

// ── JWT Authentication ──────────────────────────────────────────────────────
export async function authenticateJWT(token: string): Promise<{
  sub: string; email?: string; orgId?: string
}> {
  try {
    const audience = config.AUTH0_AUDIENCE
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${config.AUTH0_DOMAIN}/`,
      audience,
    })

    // Check JWT blacklist (for revoked tokens via logout)
    const jti = payload['jti']
    if (jti) {
      const blacklisted = await redis.exists(RedisKeys.sessionBlacklist(String(jti)))
      if (blacklisted) throw new UnauthorizedError('Token has been revoked')
    }

    return {
      sub: payload['sub'] as string,
      ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
      ...(typeof payload['https://tokensentry.ai/org_id'] === 'string'
        ? { orgId: payload['https://tokensentry.ai/org_id'] as string }
        : {}),
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired JWT')
  }
}

// ── Fastify preHandler ──────────────────────────────────────────────────────
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authorization header required: Bearer ts_live_xxx',
    })
  }

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey.startsWith('ts_')) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid API key format. Keys start with ts_live_',
    })
  }

  // Basic key length validation — all TokenSentry keys are exactly 40 chars
  // (ts_live_ = 8 chars + 32 hex chars = 40 total)
  if (rawKey.length < 20 || rawKey.length > 80) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid API key format',
    })
  }

  try {
    const ip = extractClientIp(request)
    const ctx = await authenticateApiKey(rawKey, ip)
    request.authContext = ctx

    // SECURITY FIX: Do NOT expose internal org UUID in response headers.
    // The client already knows their org — they don't need us to echo it back.
    // (Removed: reply.header('x-ts-org-id', ctx.orgId))

  } catch (err) {
    logger.warn({
      ip: request.socket.remoteAddress,
      path: request.url,
      err: (err as Error).message,
    }, 'Auth failed')

    if (err instanceof UnauthorizedError) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: err.message })
    }
    return reply.code(500).send({ error: 'AUTH_ERROR', message: 'Authentication service unavailable' })
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) { super(message); this.name = 'UnauthorizedError' }
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext
  }
}
