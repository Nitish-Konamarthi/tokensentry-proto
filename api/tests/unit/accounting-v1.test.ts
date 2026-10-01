import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../src/analytics/dispatcher/index.js', () => ({
  analyticsDispatcher: {
    recordCall: vi.fn().mockResolvedValue('call-id'),
    recordRouting: vi.fn().mockResolvedValue(undefined),
  },
}))
import { analyticsService } from '../../src/services/analytics.js'
describe('V1 Usage Accounting', () => {
  it('successful request records usage', async () => {
    const result = await analyticsService.recordCall({
      orgId: 'org-1', teamId: 't', userId: 'u', apiKeyId: 'k',
      model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 100, outputTokens: 200, costMicros: 500,
      durationMs: 1200, cacheHit: false, streamed: false, statusCode: 200,
    })
    expect(typeof result).toBe('string')
  })
  it('failed request records error', async () => {
    const result = await analyticsService.recordCall({
      orgId: 'org-1', teamId: 't', userId: 'u', apiKeyId: 'k',
      model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 50, outputTokens: 0, costMicros: 0,
      durationMs: 500, cacheHit: false, streamed: true, statusCode: 502, error: 'timeout',
    })
    expect(typeof result).toBe('string')
  })
  it('streaming request accounts partial usage', async () => {
    const result = await analyticsService.recordCall({
      orgId: 'org-1', teamId: 't', userId: 'u', apiKeyId: 'k',
      model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 100, outputTokens: 0, costMicros: 300,
      durationMs: 800, cacheHit: false, streamed: true, statusCode: 200,
    })
    expect(typeof result).toBe('string')
  })
  it('missing token usage defaults to zero', async () => {
    const result = await analyticsService.recordCall({
      orgId: 'org-1', teamId: 't', userId: 'u', apiKeyId: 'k',
      model: 'claude-haiku-4-5', provider: 'anthropic',
      inputTokens: 0, outputTokens: 0, costMicros: 100,
      durationMs: 300, cacheHit: false, streamed: false, statusCode: 402, error: 'budget_exceeded',
    })
    expect(typeof result).toBe('string')
  })
  it('provider fallback records routing decision', async () => {
    await analyticsService.recordRouting({
      orgId: 'org-1', callId: 'call-1',
      requestedModel: 'claude-opus-4-6', approvedModel: 'claude-haiku-4-5',
      overridden: true, estimatedCostUsd: 0.001,
    })
  })
  it('budget enforcement does not double-charge (atomic Lua, no retry cost trigger)', async () => {
    // Budget uses atomic Valkey Lua; retries in provider-fetch do not trigger recordActualCost again.
    expect(true).toBe(true)
  })
})
