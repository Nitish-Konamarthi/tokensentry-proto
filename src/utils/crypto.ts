// src/utils/crypto.ts
// Cryptographic utilities for API key generation and hashing
// Security: uses HMAC-SHA256 with a server-side pepper (API_KEY_PEPPER env var)
// This prevents rainbow-table attacks even if the DB is leaked.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

// ─── SERVER PEPPER ─────────────────────────────────────────────────────────
// MUST be set in .env — crashes fast at startup if missing (see config.ts)
function getPepper(): string {
  const pepper = process.env['API_KEY_PEPPER']
  if (!pepper) {
    // In test environments allow a default; in production we crash at config.ts
    if (process.env['NODE_ENV'] === 'test') return 'test-pepper-do-not-use-in-prod'
    throw new Error('API_KEY_PEPPER env var is required. Set it in your .env file.')
  }
  return pepper
}

// ─── API KEY GENERATION ────────────────────────────────────────────────────
// Format: ts_live_<32 random hex chars>  (16 random bytes)
// Example: ts_live_d3ad8eef4f2b12345678901234abcdef
export function generateApiKey(): {
  rawKey: string     // Show ONCE to user on creation — never stored
  keyHash: string    // Store in DB (HMAC-SHA256 hex, 64 chars)
  keyPrefix: string  // Show for display identification (first 16 chars)
} {
  const random = randomBytes(16).toString('hex')  // 32 hex chars = 128 bits
  const rawKey = `ts_live_${random}`
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = rawKey.slice(0, 16)  // "ts_live_XXXXXXXX"

  return { rawKey, keyHash, keyPrefix }
}

// HMAC-SHA256 hash of raw API key using server pepper
// Security properties:
//   - Deterministic: same key always produces same hash
//   - Non-reversible: can't recover raw key from hash
//   - Pepper-protected: DB leak alone cannot crack keys (rainbow tables fail)
export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', getPepper())
    .update(rawKey)
    .digest('hex')
}

// ─── PROMPT HASH ──────────────────────────────────────────────────────────
// Used for exact-match semantic cache lookup before vector search
// NOTE: prompt hashes are NOT security-sensitive (they're cache keys, not auth)
// Plain SHA-256 is fine here — speed matters more than key security
export function hashPrompt(prompt: string): string {
  // Normalize: lowercase, collapse whitespace for better cache hit rate
  const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex')
}

// ─── TURN HASH ─────────────────────────────────────────────────────────────
// Used by agentic guard to detect loops (repeated agent turns)
// MD5 is intentional here — speed matters, not collision resistance
export function hashTurn(content: string): string {
  return createHash('md5').update(content.slice(0, 1000)).digest('hex').slice(0, 16)
}

// ─── SECURE RANDOM ─────────────────────────────────────────────────────────
export function secureRandomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

// ─── CONSTANT-TIME COMPARISON ──────────────────────────────────────────────
// Prevents timing attacks when comparing hashed keys
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return timingSafeEqual(bufA, bufB)
}
