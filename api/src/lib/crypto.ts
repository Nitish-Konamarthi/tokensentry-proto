import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { env } from '../config/env.js'

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const random = randomBytes(16).toString('hex')
  const rawKey = `ts_live_${random}`
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
  }
}

export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', env.API_KEY_PEPPER).update(rawKey).digest('hex')
}

export function hashPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex')
}

export function hashTurn(content: string): string {
  return createHash('md5').update(content.slice(0, 1000)).digest('hex').slice(0, 16)
}

export function secureRandomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
