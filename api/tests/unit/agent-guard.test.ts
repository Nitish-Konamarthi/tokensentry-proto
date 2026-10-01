import { describe, it, expect } from 'vitest'
import { computeRiskScore, actionFromScore, countToolsInMessages, detectRetry, type AgentStats } from '../../src/services/agent-guard.js'

describe('computeRiskScore', () => {
  const emptyStats: AgentStats = {
    requestCount: 10, toolCount: 0, inputTokens: 10_000, outputTokens: 5_000,
    retryCount: 0, providerSwitchCount: 0, recursiveDepth: 0,
    consecutiveErrors: 0, lastProvider: null,
  }

  it('returns score 0 for new session (no stats)', () => {
    const result = computeRiskScore({
      stats: null,
      timelineCount: 0,
      recentTokens: [],
      currentInputTokens: 100,
      currentOutputTokens: 50,
      currentToolCount: 0,
      currentProvider: 'anthropic',
      budgetUtilization: 0,
      isRetry: false,
    })
    expect(result.score).toBe(0)
  })

  it('returns low score for normal usage pattern', () => {
    const result = computeRiskScore({
      stats: emptyStats,
      timelineCount: 1,
      recentTokens: [1500],
      currentInputTokens: 1000,
      currentOutputTokens: 500,
      currentToolCount: 0,
      currentProvider: 'anthropic',
      budgetUtilization: 0.1,
      isRetry: false,
    })
    expect(result.score).toBeLessThanOrEqual(40)
    expect(result.factors.length).toBeGreaterThanOrEqual(6)
  })

  describe('frequency score (0-20)', () => {
    it('stays low when requests are infrequent', () => {
      const result = computeRiskScore({
        stats: emptyStats,
        timelineCount: 1,
        recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const freq = result.factors.find(f => f.name === 'frequency')
      expect(freq!.score).toBe(0)
    })

    it('maxes at 20 when rps exceeds threshold', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, requestCount: 100 },
        timelineCount: 50,
        recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const freq = result.factors.find(f => f.name === 'frequency')
      expect(freq!.score).toBeGreaterThanOrEqual(0)
      expect(freq!.maxScore).toBe(20)
    })
  })

  describe('token growth score (0-20)', () => {
    it('scores 0 when tokens are stable', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, inputTokens: 10_000, outputTokens: 5_000, requestCount: 10 },
        timelineCount: 1,
        recentTokens: [1500],
        currentInputTokens: 1000,
        currentOutputTokens: 500,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const token = result.factors.find(f => f.name === 'token_growth')
      expect(token!.score).toBe(0)
    })

    it('scores above 0 when recent tokens surge', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, inputTokens: 10_000, outputTokens: 5_000, requestCount: 10 },
        timelineCount: 1,
        recentTokens: [10_000],
        currentInputTokens: 5000,
        currentOutputTokens: 5000,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const token = result.factors.find(f => f.name === 'token_growth')
      expect(token!.score).toBeGreaterThan(0)
      expect(token!.maxScore).toBe(20)
    })

    it('maxes at 20 on extreme token explosion', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, inputTokens: 100_000, outputTokens: 50_000, requestCount: 10 },
        timelineCount: 1,
        recentTokens: [100_000],
        currentInputTokens: 50_000,
        currentOutputTokens: 50_000,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const token = result.factors.find(f => f.name === 'token_growth')
      expect(token!.score).toBe(20)
    })
  })

  describe('retry storm score (0-15)', () => {
    it('scores 0 when no retries', () => {
      const result = computeRiskScore({
        stats: emptyStats,
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const retry = result.factors.find(f => f.name === 'retry_storm')
      expect(retry!.score).toBe(0)
    })

    it('scores when retry ratio exceeds 50%', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, retryCount: 6, requestCount: 10 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: true,
      })
      const retry = result.factors.find(f => f.name === 'retry_storm')
      expect(retry!.score).toBeGreaterThanOrEqual(5)
    })

    it('maxes at 15 on pure retry storm', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, retryCount: 9, requestCount: 10 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: true,
      })
      const retry = result.factors.find(f => f.name === 'retry_storm')
      expect(retry!.score).toBeLessThanOrEqual(15)
    })
  })

  describe('tool call score (0-15)', () => {
    it('scores 0 when tool ratio is low', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, toolCount: 1, requestCount: 10 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const tool = result.factors.find(f => f.name === 'tool_calls')
      expect(tool!.score).toBe(0)
    })

    it('scores when tool ratio exceeds 75%', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, toolCount: 8, requestCount: 10 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 1, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const tool = result.factors.find(f => f.name === 'tool_calls')
      expect(tool!.score).toBeGreaterThan(0)
    })
  })

  describe('provider thrashing score (0-10)', () => {
    it('stays 0 with single provider', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, providerSwitchCount: 0 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const prov = result.factors.find(f => f.name === 'provider_thrashing')
      expect(prov!.score).toBe(0)
    })

    it('scores on provider switches', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, providerSwitchCount: 4 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'groq',
        budgetUtilization: 0, isRetry: false,
      })
      const prov = result.factors.find(f => f.name === 'provider_thrashing')
      expect(prov!.score).toBeGreaterThan(0)
      expect(prov!.maxScore).toBe(10)
    })
  })

  describe('recursive depth score (0-10)', () => {
    it('scores 0 at shallow depth', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, recursiveDepth: 1 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const depth = result.factors.find(f => f.name === 'recursive_depth')
      expect(depth!.score).toBe(0)
    })

    it('scores at depth 3+', () => {
      const result = computeRiskScore({
        stats: { ...emptyStats, recursiveDepth: 3 },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const depth = result.factors.find(f => f.name === 'recursive_depth')
      expect(depth!.score).toBeGreaterThan(0)
    })
  })

  describe('budget exhaustion score (0-10)', () => {
    it('scores 0 with no utilization', () => {
      const result = computeRiskScore({
        stats: emptyStats,
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      const budget = result.factors.find(f => f.name === 'budget_exhaustion')
      expect(budget!.score).toBe(0)
    })

    it('scores proportionally to utilization', () => {
      const result = computeRiskScore({
        stats: emptyStats,
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 100, currentOutputTokens: 50,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0.95, isRetry: false,
      })
      const budget = result.factors.find(f => f.name === 'budget_exhaustion')
      expect(budget!.score).toBeGreaterThanOrEqual(9)
    })
  })

  describe('composite scenarios', () => {
    it('normal agent: allow (score <= 40)', () => {
      const result = computeRiskScore({
        stats: { requestCount: 5, toolCount: 2, inputTokens: 5000, outputTokens: 2500, retryCount: 0, providerSwitchCount: 0, recursiveDepth: 0, consecutiveErrors: 0, lastProvider: 'anthropic' },
        timelineCount: 1, recentTokens: [1500],
        currentInputTokens: 1000, currentOutputTokens: 500,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0.15, isRetry: false,
      })
      expect(result.score).toBeLessThanOrEqual(40)
    })

    it('runaway agent: block (score > 70)', () => {
      const result = computeRiskScore({
        stats: { requestCount: 100, toolCount: 95, inputTokens: 500_000, outputTokens: 250_000, retryCount: 80, providerSwitchCount: 8, recursiveDepth: 5, consecutiveErrors: 8, lastProvider: 'gemini' },
        timelineCount: 100, recentTokens: [50_000, 60_000, 55_000],
        currentInputTokens: 25_000, currentOutputTokens: 30_000,
        currentToolCount: 3, currentProvider: 'groq',
        budgetUtilization: 1.0, isRetry: true,
      })
      expect(result.score).toBeGreaterThan(70)
    })

    it('suspicious agent: warn (41-70)', () => {
      const result = computeRiskScore({
        stats: { requestCount: 25, toolCount: 22, inputTokens: 100_000, outputTokens: 50_000, retryCount: 18, providerSwitchCount: 4, recursiveDepth: 3, consecutiveErrors: 3, lastProvider: 'openai' },
        timelineCount: 30, recentTokens: [8000, 10_000, 9000],
        currentInputTokens: 5000, currentOutputTokens: 5000,
        currentToolCount: 2, currentProvider: 'groq',
        budgetUtilization: 0.95, isRetry: true,
      })
      expect(result.score).toBeGreaterThanOrEqual(41)
      expect(result.score).toBeLessThanOrEqual(70)
    })
  })

  describe('score clamping', () => {
    it('never returns less than 0', () => {
      const result = computeRiskScore({
        stats: emptyStats,
        timelineCount: 0, recentTokens: [],
        currentInputTokens: 0, currentOutputTokens: 0,
        currentToolCount: 0, currentProvider: 'anthropic',
        budgetUtilization: 0, isRetry: false,
      })
      expect(result.score).toBeGreaterThanOrEqual(0)
    })

    it('never returns more than 100', () => {
      const result = computeRiskScore({
        stats: { requestCount: 999, toolCount: 999, inputTokens: 10_000_000, outputTokens: 10_000_000, retryCount: 999, providerSwitchCount: 99, recursiveDepth: 99, consecutiveErrors: 99, lastProvider: 'anthropic' },
        timelineCount: 100, recentTokens: [100_000],
        currentInputTokens: 50_000, currentOutputTokens: 50_000,
        currentToolCount: 5, currentProvider: 'gemini',
        budgetUtilization: 1.5, isRetry: true,
      })
      expect(result.score).toBeLessThanOrEqual(100)
      expect(result.score).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('actionFromScore', () => {
  it.each([
    [0, 'allow' as const],
    [20, 'allow' as const],
    [40, 'allow' as const],
    [41, 'warn' as const],
    [55, 'warn' as const],
    [70, 'warn' as const],
    [71, 'block' as const],
    [85, 'block' as const],
    [100, 'block' as const],
  ])('returns %s for score %d', (score, expected) => {
    expect(actionFromScore(score)).toBe(expected)
  })
})

describe('tool detection and retry detection', () => {
  it('counts tool_use blocks in assistant messages', () => {
    const count = countToolsInMessages([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'search' }] },
      { role: 'tool', content: 'result' },
    ])
    expect(count).toBe(2)
  })

  it('counts tool_calls in assistant messages', () => {
    const count = countToolsInMessages([
      { role: 'assistant', content: [{ type: 'tool_calls', function: { name: 'search' } }] },
    ])
    expect(count).toBe(1)
  })

  it('detects retry when last two messages are identical', () => {
    const result = detectRetry([
      { role: 'user', content: 'what is the weather?' },
      { role: 'assistant', content: 'sunny' },
      { role: 'user', content: 'what is the weather?' },
      { role: 'assistant', content: 'sunny' },
    ])
    expect(result).toBe(true)
  })

  it('does not detect retry when messages differ', () => {
    const result = detectRetry([
      { role: 'user', content: 'what is the weather?' },
      { role: 'assistant', content: 'sunny' },
      { role: 'user', content: 'what about tomorrow?' },
      { role: 'assistant', content: 'rainy' },
    ])
    expect(result).toBe(false)
  })

  it('returns false for messages with fewer than 4 entries', () => {
    expect(detectRetry([{ role: 'user', content: 'hello' }])).toBe(false)
    expect(detectRetry([])).toBe(false)
    expect(detectRetry([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ])).toBe(false)
  })
})
