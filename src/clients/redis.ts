// src/clients/redis.ts
// ioredis client with connection pooling and Lua script support
// Used for: budget counters, semantic cache, agent state, rate limits, auth cache

import Redis from 'ioredis'
import { logger } from '../utils/logger.js'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis

  _redis = new Redis(process.env['REDIS_URL']!, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    keepAlive: 30_000,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.error('Redis retry limit exceeded')
        return null
      }
      return Math.min(times * 500, 2000)
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
      return targetErrors.some(e => err.message.includes(e)) ? 2 : false
    },
  })

  _redis.on('connect', () => logger.info('Redis connected'))
  _redis.on('error', (err) => logger.error({ err }, 'Redis error'))
  _redis.on('close', () => logger.warn('Redis connection closed'))

  return _redis
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getRedis() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// ─── REDIS KEY PATTERNS ────────────────────────────────────────────────────
// Centralized key generation — prevents typos, enables easy refactoring

export const RedisKeys = {
  // Budget counters (expire at end of billing period)
  orgBudget:   (orgId: string, period: string) => `budget:org:${orgId}:${period}`,
  teamBudget:  (teamId: string, period: string) => `budget:team:${teamId}:${period}`,
  userBudget:  (userId: string, period: string) => `budget:user:${userId}:${period}`,
  orgDaily:    (orgId: string, date: string) => `budget:org:${orgId}:daily:${date}`,

  // Semantic embedding cache
  embed:       (prefix: string) => `embed:${prefix}`,

  // Dashboard cache (1 minute TTL)
  dashboard:   (orgId: string, minute: number) => `dashboard:${orgId}:${minute}`,
  analytics:   (orgId: string, routeHash: string) => `analytics:${orgId}:${routeHash}`,

  // Agentic session state
  agentTurns:  (agentId: string) => `agent:turns:${agentId}`,
  agentLoops:  (agentId: string) => `agent:loops:${agentId}`,
  agentBudget: (agentId: string) => `agent:budget:${agentId}`,

  // Auth cache (5 minute TTL)
  authApiKey:  (keyHashPrefix: string) => `auth:apikey:${keyHashPrefix}`,
  sessionBlacklist: (jti: string) => `session:blacklist:${jti}`,

  // Rate limiting
  rateLimit:   (orgId: string, endpoint: string, minute: number) =>
                `ratelimit:${orgId}:${endpoint}:${minute}`,

  // Org config cache (5 minute TTL)
  orgConfig:   (orgId: string) => `config:org:${orgId}`,
} as const

// ─── TTL CONSTANTS ─────────────────────────────────────────────────────────
export const TTL = {
  AUTH_CACHE_SECONDS: 300,        // 5 minutes
  ORG_CONFIG_SECONDS: 300,        // 5 minutes
  DASHBOARD_SECONDS: 60,           // 1 minute
  ANALYTICS_SECONDS: 30,           // 30 seconds
  EMBED_SECONDS: 3600,             // 1 hour
  AGENT_SESSION_SECONDS: 3600,     // 1 hour (agents reset every call)
  RATE_LIMIT_SECONDS: 120,         // 2 minutes
} as const

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping()
    return result === 'PONG'
  } catch {
    return false
  }
}

// ─── CLEANUP ───────────────────────────────────────────────────────────────
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}
