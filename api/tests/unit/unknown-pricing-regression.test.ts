import { describe, it, expect } from 'vitest'
import { isUnknownPricing } from '../../src/services/catalog-pricing.js'

describe('Unknown pricing semantics', () => {
  it('distinguishes NaN sentinel from real zero pricing', () => {
    const unknown = { input: Number.NaN, output: Number.NaN }
    const zero = { input: 0, output: 0 }
    expect(isUnknownPricing(unknown)).toBe(true)
    expect(isUnknownPricing(zero)).toBe(false)
  })

  it('rejects partial NaN as unknown', () => {
    const partial = { input: Number.NaN, output: 5 }
    expect(isUnknownPricing(partial)).toBe(false)
  })
})
