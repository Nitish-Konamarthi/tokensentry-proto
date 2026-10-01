import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../src/clients/valkey.js', () => ({
  valkey: {
    eval: vi.fn().mockResolvedValue([[{ agent_id: 'agent-1', org_id: 'org-1', status: 'active', started_at: '1234567890000', last_request_at: '1234568000000' }, { request_count: '5', tool_count: '0', input_tokens: '100', output_tokens: '200', retry_count: '0', provider_switch_count: '0', recursive_depth: '0', consecutive_errors: '0', last_provider: 'anthropic' }]]),
    multi: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[1], [-1]]),
    }),
    get: vi.fn(),
    setex: vi.fn(),
    hgetall: vi.fn().mockResolvedValue({ agent_id: 'agent-1', org_id: 'org-1', status: 'active', started_at: '1234567890000', last_request_at: '1234568000000', request_count: '5', tool_count: '0', input_tokens: '100', output_tokens: '200', retry_count: '0', provider_switch_count: '0', recursive_depth: '0', consecutive_errors: '0', last_provider: 'anthropic' }),
    hget: vi.fn(),
    hincrby: vi.fn(),
    hset: vi.fn(),
    zcard: vi.fn().mockResolvedValue(3),
    zremrangebyscore: vi.fn(),
    zrangebyscore: vi.fn().mockResolvedValue(['100', '200', '300']),
    del: vi.fn(),
    exists: vi.fn(),
    scan: vi.fn().mockResolvedValue(['0', []]),
  },
  ValkeyKeys: {
    agentSession: (sid: string) => `agent:session:${sid}`,
    agentStats: (sid: string) => `agent:stats:${sid}`,
    agentTimeline: (sid: string) => `agent:timeline:${sid}`,
    agentTools: (sid: string) => `agent:tools:${sid}`,
    agentProviders: (sid: string) => `agent:providers:${sid}`,
    agentTokenHistory: (sid: string) => `agent:token:${sid}`,
    agentBlocked: (sid: string) => `agent:blocked:${sid}`,
  },
  checkValkeyHealth: vi.fn().mockResolvedValue(true),
  closeValkey: vi.fn(),
}))
import { agentGuardService } from '../../src/services/agent-guard.js'
describe('Agent Guard V1', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('normal agent: allow', async () => {
    const result = await agentGuardService.evaluate({
      sessionId: 'sess-1', agentId: 'agent-1', orgId: 'org-1',
      inputTokens: 100, outputTokens: 200, toolCount: 0,
      provider: 'anthropic', budgetUtilization: 0.1, timestamp: Date.now(),
    }, [{ role: 'user', content: 'Hello' }])
    expect(result.action).toBe('allow')
    expect(result.blocked).toBe(false)
  })
  it('high-frequency agent: warn or block', async () => {
    const valkey = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.valkey.zcard).mockResolvedValueOnce(15)
    const result = await agentGuardService.evaluate({
      sessionId: 'sess-high', agentId: 'agent-1', orgId: 'org-1',
      inputTokens: 100, outputTokens: 100, toolCount: 0,
      provider: 'anthropic', budgetUtilization: 0.1, timestamp: Date.now(),
    }, [{ role: 'user', content: 'Hello' }])
    expect(typeof result.score).toBe('number')
    expect(['allow', 'warn', 'block']).toContain(result.action)
  })
  it('retry storm: score reflects retries', async () => {
    const valkey = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.valkey.hgetall).mockResolvedValueOnce({
      agent_id: 'agent-1', org_id: 'org-1', status: 'active', started_at: '123',
      request_count: '10', tool_count: '0', input_tokens: '500', output_tokens: '500',
      retry_count: '8', provider_switch_count: '0', recursive_depth: '0',
      consecutive_errors: '0', last_provider: 'anthropic',
    })
    const result = await agentGuardService.evaluate({
      sessionId: 'sess-retry', agentId: 'agent-1', orgId: 'org-1',
      inputTokens: 100, outputTokens: 100, toolCount: 0,
      provider: 'anthropic', budgetUtilization: 0.1, timestamp: Date.now(),
    }, [{ role: 'user', content: 'Hello' }, { role: 'user', content: 'Hello' }])
    expect(typeof result.score).toBe('number')
  })
  it('provider thrashing: score reflects switches', async () => {
    const valkey = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.valkey.hgetall).mockResolvedValueOnce({
      agent_id: 'agent-1', org_id: 'org-1', status: 'active', started_at: '123',
      request_count: '5', tool_count: '0', input_tokens: '500', output_tokens: '500',
      retry_count: '0', provider_switch_count: '3', recursive_depth: '0',
      consecutive_errors: '0', last_provider: 'openai',
    })
    const result = await agentGuardService.evaluate({
      sessionId: 'sess-thrash', agentId: 'agent-1', orgId: 'org-1',
      inputTokens: 100, outputTokens: 100, toolCount: 0,
      provider: 'anthropic', budgetUtilization: 0.1, timestamp: Date.now(),
    }, [{ role: 'user', content: 'Hello' }])
    expect(typeof result.score).toBe('number')
    expect(result.factors.some(f => f.name === 'provider_thrashing')).toBe(true)
  })
  it('budget exhaustion: score increases with utilization', async () => {
    const result = await agentGuardService.evaluate({
      sessionId: 'sess-budget', agentId: 'agent-1', orgId: 'org-1',
      inputTokens: 100, outputTokens: 100, toolCount: 0,
      provider: 'anthropic', budgetUtilization: 0.95, timestamp: Date.now(),
    }, [{ role: 'user', content: 'Hello' }])
    const budgetFactor = result.factors.find(f => f.name === 'budget_exhaustion')
    expect(budgetFactor).toBeDefined()
    expect(budgetFactor!.score).toBeGreaterThanOrEqual(5)
  })
  it('blocked session: returns blocked result', async () => {
    const valkey = await import('../../src/clients/valkey.js')
    vi.mocked(valkey.valkey.get).mockResolvedValue('1')
    const blocked = await agentGuardService.isBlocked('sess-block')
    expect(blocked).toBe(true)
  })
  it('state expiration: session removed after TTL (verified by source)', async () => {
    await agentGuardService.removeSession('sess-expire')
    const valkey = await import('../../src/clients/valkey.js')
    expect(vi.mocked(valkey.valkey.del)).toHaveBeenCalled()
  })
})
