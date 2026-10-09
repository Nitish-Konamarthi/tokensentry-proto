import Redis from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

let _valkey: Redis | null = null

export function getValkey(): Redis {
  if (_valkey) return _valkey

  _valkey = new Redis(env.VALKEY_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    keepAlive: 30_000,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.error('Valkey retry limit exceeded')
        return null
      }
      return Math.min(times * 500, 2000)
    },
  })

  _valkey.on('connect', () => logger.info('Valkey connected'))
  _valkey.on('error', (err) => logger.error({ err }, 'Valkey error'))
  _valkey.on('close', () => logger.warn('Valkey connection closed'))

  return _valkey
}

export const valkey = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getValkey() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const ValkeyKeys = {
  budgetMonthly: (orgId: string, yyyyMm: string) => `budget:monthly:${orgId}:${yyyyMm}`,
  budgetDaily: (orgId: string, date: string) => `budget:daily:${orgId}:${date}`,
  budgetReservation: (orgId: string, reservationId: string) => `budget:reservation:${orgId}:${reservationId}`,
  budgetTeam: (teamId: string, yyyyMm: string) => `budget:team:${teamId}:${yyyyMm}`,
  budgetUser: (userId: string, yyyyMm: string) => `budget:user:${userId}:${yyyyMm}`,
  rateLimit: (key: string, windowSec: number) => `ratelimit:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`,
  authKey: (keyHash: string) => `auth:key:${keyHash}`,
  authJwtBlacklist: (jti: string) => `auth:blacklist:${jti}`,
  providerHealth: (provider: string) => `provider:health:${provider}`,
  realtimeSpend: (orgId: string, date: string) => `realtime:spend:${orgId}:${date}`,
  agentSession: (orgId: string, sessionId: string) => `agent:session:${orgId}:${sessionId}`,
  agentStats: (orgId: string, sessionId: string) => `agent:stats:${orgId}:${sessionId}`,
  agentTimeline: (orgId: string, sessionId: string) => `agent:timeline:${orgId}:${sessionId}`,
  agentTools: (orgId: string, sessionId: string) => `agent:tools:${orgId}:${sessionId}`,
  agentProviders: (orgId: string, sessionId: string) => `agent:providers:${orgId}:${sessionId}`,
  agentBlocked: (orgId: string, sessionId: string) => `agent:blocked:${orgId}:${sessionId}`,
  agentTokenHistory: (orgId: string, sessionId: string) => `agent:tokens:${orgId}:${sessionId}`,
  sessionCache: (sessionId: string) => `session:${sessionId}`,
} as const

export async function checkValkeyHealth(): Promise<boolean> {
  try {
    return await valkey.ping() === 'PONG'
  } catch {
    return false
  }
}

export async function closeValkey(): Promise<void> {
  if (_valkey) {
    await _valkey.quit()
    _valkey = null
  }
}
