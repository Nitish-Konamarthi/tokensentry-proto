import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/intelligence/analyzer/index.js', () => ({
  normalizeRequestPayload: vi.fn((payload) => payload),
  computeRequestHash: vi.fn(() => 'request-hash'),
  estimateTokenCount: vi.fn(() => 100),
}))

vi.mock('../../src/services/budget.js', () => ({
  budgetService: {
    checkAndDeduct: vi.fn(),
    releaseReservation: vi.fn(),
    recordActualCost: vi.fn(),
  },
}))

vi.mock('../../src/services/router.js', () => ({
  routerService: {
    estimateCost: vi.fn(() => 0.001),
    route: vi.fn(),
    calculateSavings: vi.fn(() => 0),
  },
}))

vi.mock('../../src/services/provider-router.js', () => {
  class ProviderUnavailableError extends Error {}
  return {
    ProviderUnavailableError,
    providerRouter: {
      resolveProvider: vi.fn(() => 'anthropic'),
      resolveUpstream: vi.fn(() => ({ upstreamId: 'anthropic', upstreamModelId: 'claude-sonnet-4-6', provider: 'anthropic' })),
      route: vi.fn(),
      routeWithFallback: vi.fn(),
      markProviderError: vi.fn(),
    },
  }
})

vi.mock('../../src/services/analytics.js', () => ({
  analyticsService: { recordCall: vi.fn(), recordRouting: vi.fn() },
}))

vi.mock('../../src/services/agent-guard.js', () => ({
  agentGuardService: {
    isBlocked: vi.fn(),
    evaluate: vi.fn(),
    incrementErrors: vi.fn(),
    recordTurn: vi.fn(),
  },
}))

vi.mock('../../src/repositories/agent-guard.js', () => ({
  agentGuardRepo: { recordGuardEvent: vi.fn(), upsertSession: vi.fn() },
}))

vi.mock('../../src/repositories/org.js', () => ({
  orgRepo: { findById: vi.fn() },
}))

vi.mock('../../src/services/provider-credentials.js', () => ({
  getProviderApiKey: vi.fn(),
}))

import { DecisionEngine } from '../../src/intelligence/decision-engine/DecisionEngine.js'
import { createRequestContext } from '../../src/intelligence/request-context.js'
import { budgetService } from '../../src/services/budget.js'
import { routerService } from '../../src/services/router.js'
import { ProviderUnavailableError, providerRouter } from '../../src/services/provider-router.js'
import { agentGuardService } from '../../src/services/agent-guard.js'
import { orgRepo } from '../../src/repositories/org.js'
import { getProviderApiKey } from '../../src/services/provider-credentials.js'

const approvedBudget = {
  approved: true,
  reason: 'approved',
  current_spend_usd: 0,
  limit_usd: 500,
  utilization: 0,
  should_alert_80: false,
  should_alert_95: false,
}

function requestContext(agent = false) {
  return createRequestContext({
    requestId: 'call-123',
    apiKey: 'key-123',
    organizationId: 'org-123',
    teamId: 'team-123',
    userId: 'user-123',
    userRole: 'admin',
    body: {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 20,
    },
    receivedAt: Date.now(),
    agentId: agent ? 'agent-123' : undefined,
    sessionId: agent ? 'session-123' : undefined,
  })
}

describe('DecisionEngine V1 reservation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(budgetService.checkAndDeduct).mockResolvedValue(approvedBudget)
    vi.mocked(routerService.route).mockResolvedValue({
      approvedModel: 'claude-sonnet-4-6',
      complexity: 'low',
      confidence: 1,
      reasoning: 'Requested model is allowed by policy',
      overridden: false,
      estimatedCostUsd: 0.001,
    })
    vi.mocked(orgRepo.findById).mockResolvedValue(null)
    vi.mocked(agentGuardService.isBlocked).mockResolvedValue(false)
    vi.mocked(agentGuardService.evaluate).mockResolvedValue({
      blocked: false,
      action: 'allow',
      score: 0,
      factors: [],
    })
  })

  it('releases a reservation when the selected provider has no configured credential', async () => {
    vi.mocked(getProviderApiKey).mockResolvedValue(undefined)

    const result = await new DecisionEngine().decide(requestContext())

    expect(result).toMatchObject({
      statusCode: 500,
      body: {
        error: 'CONFIG_ERROR',
        call_id: 'call-123',
      },
    })
    expect(budgetService.releaseReservation).toHaveBeenCalledTimes(1)
    expect(budgetService.releaseReservation).toHaveBeenCalledWith({
      orgId: 'org-123',
      estimatedCostMicros: 1000,
    })
  })

  it('releases a reservation when credential lookup fails unexpectedly', async () => {
    vi.mocked(getProviderApiKey).mockRejectedValue(new Error('credential store unavailable'))

    await expect(new DecisionEngine().decide(requestContext())).rejects.toThrow('credential store unavailable')

    expect(budgetService.releaseReservation).toHaveBeenCalledTimes(1)
  })

  it('releases a reservation when Agent Guard blocks after budget approval', async () => {
    vi.mocked(agentGuardService.evaluate).mockResolvedValue({
      blocked: true,
      action: 'block',
      score: 90,
      factors: ['retry_storm'],
    })

    const result = await new DecisionEngine().decide(requestContext(true))

    expect(result).toMatchObject({
      statusCode: 429,
      body: {
        error: 'AGENT_BLOCKED',
        call_id: 'call-123',
      },
    })
    expect(budgetService.releaseReservation).toHaveBeenCalledTimes(1)
    expect(getProviderApiKey).not.toHaveBeenCalled()
  })

  it('returns a safe provider-unavailable error and releases its reservation', async () => {
    vi.mocked(getProviderApiKey).mockResolvedValue('provider-key')
    vi.mocked(providerRouter.routeWithFallback).mockRejectedValue(new ProviderUnavailableError('anthropic'))

    const result = await new DecisionEngine().decide(requestContext())

    expect(result).toMatchObject({
      statusCode: 502,
      body: {
        error: 'PROVIDER_UNAVAILABLE',
        message: 'Provider temporarily unavailable',
        call_id: 'call-123',
      },
    })
    expect(budgetService.releaseReservation).toHaveBeenCalledTimes(1)
  })
})
