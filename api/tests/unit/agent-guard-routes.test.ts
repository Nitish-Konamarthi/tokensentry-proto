import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/middleware/auth.js', () => ({
  requireApiKey: vi.fn(async (request: any) => {
    request.authContext = { orgId: 'org-1' }
  }),
}))

vi.mock('../../src/middleware/auth-admin.js', () => ({
  requireAdmin: vi.fn(async () => {}),
}))

vi.mock('../../src/services/agent-guard.js', () => ({
  agentGuardService: {
    listActiveSessions: vi.fn(),
    getSession: vi.fn(),
    getStats: vi.fn(),
    setBlocked: vi.fn(),
    removeSession: vi.fn(),
  },
}))

vi.mock('../../src/repositories/agent-guard.js', () => ({
  agentGuardRepo: {
    findSession: vi.fn(),
    getActiveSessions: vi.fn(),
    getGuardEvents: vi.fn(),
    upsertSession: vi.fn(),
    terminateSession: vi.fn(),
  },
}))

import { agentGuardRoutes } from '../../src/routes/agent-guard.js'
import { agentGuardService } from '../../src/services/agent-guard.js'
import { agentGuardRepo } from '../../src/repositories/agent-guard.js'

describe('Agent Guard termination route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(agentGuardService.getSession).mockResolvedValue(null)
    vi.mocked(agentGuardRepo.findSession).mockResolvedValue(null)
    vi.mocked(agentGuardRepo.terminateSession).mockResolvedValue(true)
    vi.mocked(agentGuardService.setBlocked).mockResolvedValue()
  })

  it('terminates a PostgreSQL-only session even if the Valkey block cache is unavailable', async () => {
    vi.mocked(agentGuardService.setBlocked).mockRejectedValueOnce(new Error('Valkey unavailable'))
    vi.mocked(agentGuardRepo.findSession).mockResolvedValue({
      id: 'row-1', orgId: 'org-1', agentId: 'agent-1', sessionId: 'session-1',
      status: 'active', turnCount: 4, tokensConsumed: 100, tokenBudget: 100_000,
      loopDetected: false, riskScore: 0, lastAction: 'allow',
      startedAt: new Date('2026-01-01T00:00:00Z'), terminatedAt: null,
    })

    const app = Fastify()
    await app.register(agentGuardRoutes)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents/session-1/terminate',
    })

    expect(response.statusCode).toBe(200)
    expect(agentGuardRepo.terminateSession).toHaveBeenCalledWith('org-1', 'session-1')
    expect(agentGuardService.setBlocked).toHaveBeenCalledWith('session-1', 'org-1')
    expect(agentGuardService.removeSession).not.toHaveBeenCalled()
    await app.close()
  })

  it('creates durable termination state for a Valkey-only session', async () => {
    vi.mocked(agentGuardService.getSession).mockResolvedValue({
      agentId: 'agent-1', orgId: 'org-1', status: 'active',
      startedAt: 100, lastRequestAt: 200,
    })
    vi.mocked(agentGuardService.getStats).mockResolvedValue({
      requestCount: 4, toolCount: 1, inputTokens: 50, outputTokens: 70,
      retryCount: 0, providerSwitchCount: 0, recursiveDepth: 0,
      consecutiveErrors: 0, lastProvider: 'anthropic',
    })

    const app = Fastify()
    await app.register(agentGuardRoutes)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents/session-1/terminate',
    })

    expect(response.statusCode).toBe(200)
    expect(agentGuardRepo.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1', agentId: 'agent-1', sessionId: 'session-1',
      turnCount: 4, tokensConsumed: 120, action: 'block',
    }))
    expect(agentGuardService.setBlocked).toHaveBeenCalledWith('session-1', 'org-1')
    await app.close()
  })
})
