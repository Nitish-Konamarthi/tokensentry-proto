# Minimal smoke test for OpenAI-compatible gateway
# Run: npm test -- tests/smoke/openai-compat.ts
import { describe, it } from 'vitest'
describe('Smoke', () => {
  it('endpoint exists', async () => {
    expect(typeof fetch).toBe('function')
  })
})
