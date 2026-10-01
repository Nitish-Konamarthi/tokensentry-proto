import { valkey, ValkeyKeys } from '../clients/valkey.js'
import type { RateLimitConfig } from '../types/index.js'

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local max_requests = tonumber(ARGV[2])

local count = redis.call('INCR', key)
local ttl = redis.call('PTTL', key)

if count == 1 and (ttl == -1 or ttl == -2) then
  redis.call('PEXPIRE', key, window_ms)
  ttl = window_ms
end

return {count, ttl, max_requests}
`

export class RateLimiterService {
  async check(key: string, config: RateLimitConfig): Promise<{
    allowed: boolean
    remaining: number
    resetMs: number
  }> {
    const windowKey = ValkeyKeys.rateLimit(key, Math.floor(config.window_ms / 1000))

    const result = await valkey.eval(
      RATE_LIMIT_LUA, 1,
      windowKey,
      String(config.window_ms),
      String(config.max_requests),
    ) as [number, number, number]

    const [count, ttl, maxReq] = result
    const allowed = count <= maxReq
    const resetMs = ttl > 0 ? ttl : config.window_ms

    return {
      allowed,
      remaining: Math.max(0, maxReq - count),
      resetMs,
    }
  }
}

export const rateLimiter = new RateLimiterService()
