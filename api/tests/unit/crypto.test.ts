import { describe, it, expect } from 'vitest'
import { generateApiKey, hashApiKey, hashPrompt, safeCompare } from '../../src/lib/crypto.js'

describe('generateApiKey', () => {
  it('generates key in correct format', () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    expect(rawKey).toMatch(/^ts_live_[0-9a-f]{32}$/)
    expect(keyPrefix).toBe(rawKey.slice(0, 16))
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey().rawKey))
    expect(keys.size).toBe(100)
  })
})

describe('hashApiKey', () => {
  it('produces consistent hashes', () => {
    const hash1 = hashApiKey('ts_live_abc123')
    const hash2 = hashApiKey('ts_live_abc123')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different keys', () => {
    const hash1 = hashApiKey('ts_live_abc123')
    const hash2 = hashApiKey('ts_live_def456')
    expect(hash1).not.toBe(hash2)
  })
})

describe('hashPrompt', () => {
  it('normalizes whitespace', () => {
    const a = hashPrompt('Hello   world')
    const b = hashPrompt('Hello world')
    expect(a).toBe(b)
  })
})

describe('safeCompare', () => {
  it('returns true for equal strings', () => {
    expect(safeCompare('abc', 'abc')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(safeCompare('abc', 'xyz')).toBe(false)
  })

  it('returns false for different lengths', () => {
    expect(safeCompare('abc', 'abcd')).toBe(false)
  })
})
