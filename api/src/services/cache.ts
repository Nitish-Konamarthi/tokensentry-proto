import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { env } from '../config/env.js'

export interface ExactCacheEntry {
  statusCode: number
  body: unknown
  cachedAt: number
  inputTokens: number
  outputTokens: number
}

export async function getExactCache(orgId: string, requestHash: string): Promise<ExactCacheEntry | null> {
  const key = ValkeyKeys.exactCache(orgId, requestHash)
  const raw = await valkey.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as ExactCacheEntry
  } catch {
    await valkey.del(key)
    return null
  }
}

export async function setExactCache(orgId: string, requestHash: string, statusCode: number, body: unknown, inputTokens: number, outputTokens: number): Promise<void> {
  const key = ValkeyKeys.exactCache(orgId, requestHash)
  const payload: ExactCacheEntry = {
    statusCode,
    body,
    cachedAt: Date.now(),
    inputTokens,
    outputTokens,
  }

  await valkey.setex(key, env.PROMPT_CACHE_TTL_SECONDS, JSON.stringify(payload))
}
