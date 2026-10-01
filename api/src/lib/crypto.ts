import { createHash, createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'crypto'
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

const ENCRYPTION_KEY = (env.ENCRYPTION_KEY || env.API_KEY_PEPPER).slice(0, 32).padEnd(32, 'x')
const ALGORITHM = 'aes-256-gcm'

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decrypt(encoded: string): string {
  const [ivHex, authTagHex, encrypted] = encoded.split(':')
  if (!ivHex || !authTagHex || !encrypted) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
