import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'

export interface GuardInput {
  sessionId: string
  agentId: string
  orgId: string
  inputTokens: number
  outputTokens: number
  toolCount: number
  provider: string
  budgetUtilization: number
  timestamp: number
}

export interface RiskFactor {
  name: string
  score: number
  maxScore: number
}

export interface GuardResult {
  score: number
  action: 'allow' | 'warn' | 'block'
  factors: RiskFactor[]
  sessionId: string
  blocked: boolean
}

const TIMELINE_WINDOW_MS = 60_000
const TOKEN_HISTORY_WINDOW_MS = 300_000
const FREQUENCY_THRESHOLD_RPS = env.AGENT_GUARD_MAX_RPS ?? 4
const RETRY_RATIO_THRESHOLD = env.AGENT_GUARD_RETRY_RATIO ?? 0.5
const TOOL_RATIO_THRESHOLD = env.AGENT_GUARD_TOOL_RATIO ?? 0.75
const RECURSIVE_DEPTH_LIMIT = env.AGENT_GUARD_RECURSIVE_DEPTH_LIMIT ?? 2

const LUA_RECORD_TURN = `
local session_key = KEYS[1]
local stats_key = KEYS[2]
local timeline_key = KEYS[3]
local tools_key = KEYS[4]
local providers_key = KEYS[5]
local token_key = KEYS[6]

local now = tonumber(ARGV[1])
local input_tok = tonumber(ARGV[2])
local output_tok = tonumber(ARGV[3])
local provider = ARGV[4]
local tool_count = tonumber(ARGV[5])
local agent_id = ARGV[6]
local org_id = ARGV[7]

-- Set session metadata for new sessions
redis.call('HSETNX', session_key, 'agent_id', agent_id)
redis.call('HSETNX', session_key, 'org_id', org_id)
redis.call('HSETNX', session_key, 'status', 'active')
redis.call('HSETNX', session_key, 'started_at', now)
redis.call('HSET', session_key, 'last_request_at', now)

-- Increment counters
local prev_req = redis.call('HINCRBY', stats_key, 'request_count', 1)
local prev_tool = redis.call('HINCRBY', stats_key, 'tool_count', tool_count)
local prev_in = redis.call('HINCRBY', stats_key, 'input_tokens', input_tok)
local prev_out = redis.call('HINCRBY', stats_key, 'output_tokens', output_tok)

-- Track provider switching
local last_provider = redis.call('HGET', stats_key, 'last_provider')
if last_provider and last_provider ~= provider then
  redis.call('HINCRBY', stats_key, 'provider_switch_count', 1)
end
redis.call('HSET', stats_key, 'last_provider', provider)

-- Record tools used
if tool_count > 0 then
  redis.call('SADD', tools_key, 'tool_call_made')
end

-- Track provider in set
redis.call('SADD', providers_key, provider)

-- Add to timeline
redis.call('ZADD', timeline_key, now, 'req_' .. prev_req)

-- Record token snapshot
local total_tokens = input_tok + output_tok
redis.call('ZADD', token_key, now, total_tokens)

-- Trim timeline to window
local cutoff = now - 60000
redis.call('ZREMRANGEBYSCORE', timeline_key, 0, cutoff)
redis.call('ZREMRANGEBYSCORE', token_key, 0, cutoff)

-- Set TTLs (15 minutes since last activity)
redis.call('EXPIRE', session_key, 900)
redis.call('EXPIRE', stats_key, 900)
redis.call('EXPIRE', timeline_key, 900)
redis.call('EXPIRE', tools_key, 900)
redis.call('EXPIRE', providers_key, 900)
redis.call('EXPIRE', token_key, 900)

-- Return current state as JSON
local session_data = redis.call('HGETALL', session_key)
local stats_data = redis.call('HGETALL', stats_key)
return {session_data, stats_data}
`

export function countToolsInMessages(messages: Array<{ role: string; content: string | Array<unknown> }>): number {
  let count = 0
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          const b = block as Record<string, unknown>
          if (b['type'] === 'tool_use' || b['type'] === 'tool_calls') count++
        }
      }
    }
    if (msg.role === 'tool') count++
  }
  return count
}

export function detectRetry(
  messages: Array<{ role: string; content: string | Array<unknown> }>,
): boolean {
  if (messages.length < 4) return false
  const lastUser = messages[messages.length - 2]
  const firstUser = messages[messages.length - 4]
  if (!lastUser || !firstUser) return false
  if (lastUser.role !== 'user' || firstUser.role !== 'user') return false
  const lastContent = typeof lastUser.content === 'string' ? lastUser.content : ''
  const firstContent = typeof firstUser.content === 'string' ? firstUser.content : ''
  if (!lastContent || !firstContent) return false
  return lastContent === firstContent
}

export function computeRiskScore(params: {
  stats: AgentStats | null
  timelineCount: number
  recentTokens: number[]
  currentInputTokens: number
  currentOutputTokens: number
  currentToolCount: number
  currentProvider: string
  budgetUtilization: number
  isRetry: boolean
}): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []
  const s = params.stats

  if (!s) {
    return { score: 0, factors: [{ name: 'new_session', score: 0, maxScore: 0 }] }
  }

  // ── Frequency Score (0-20) ──
  const rps = Math.max(params.timelineCount - 1, 0) / (TIMELINE_WINDOW_MS / 1000)
  const freqScore = Math.min(Math.round((rps / FREQUENCY_THRESHOLD_RPS) * 20), 20)
  factors.push({ name: 'frequency', score: freqScore, maxScore: 20 })

  // ── Token Growth Score (0-20) ──
  let tokenScore = 0
  const currentTotal = params.currentInputTokens + params.currentOutputTokens
  const totalTokens = s.inputTokens + s.outputTokens
  const prevTotal = totalTokens - currentTotal

  if (prevTotal > 0 && params.recentTokens.length > 0) {
    const recentAvg = params.recentTokens.reduce((a, b) => a + b, 0) / params.recentTokens.length
    const overallAvg = prevTotal / Math.max(s.requestCount - 1, 1)
    if (overallAvg > 0) {
      const ratio = recentAvg / overallAvg
      if (ratio > 1.5) {
        tokenScore = Math.min(Math.round((ratio - 1.5) * 20), 20)
      }
    }
  }
  factors.push({ name: 'token_growth', score: tokenScore, maxScore: 20 })

  // ── Retry Storm Score (0-15) ──
  let retryScore = 0
  if (s.retryCount > 0 && s.requestCount > 0) {
    const retryRatio = s.retryCount / s.requestCount
    if (retryRatio >= RETRY_RATIO_THRESHOLD) {
      retryScore = Math.min(Math.round((retryRatio - RETRY_RATIO_THRESHOLD) * 30), 15)
    }
  }
  if (params.isRetry) {
    retryScore = Math.max(retryScore, 5)
  }
  factors.push({ name: 'retry_storm', score: retryScore, maxScore: 15 })

  // ── Tool Call Score (0-15) ──
  let toolScore = 0
  if (s.toolCount > 0 && s.requestCount > 0) {
    const toolRatio = s.toolCount / s.requestCount
    if (toolRatio >= TOOL_RATIO_THRESHOLD) {
      toolScore = Math.min(Math.round((toolRatio - TOOL_RATIO_THRESHOLD) * 30), 15)
    }
  }
  factors.push({ name: 'tool_calls', score: toolScore, maxScore: 15 })

  // ── Provider Thrashing Score (0-10) ──
  let providerScore = 0
  if (s.providerSwitchCount >= 2) {
    providerScore = Math.min(s.providerSwitchCount * 3, 10)
  }
  factors.push({ name: 'provider_thrashing', score: providerScore, maxScore: 10 })

  // ── Recursive Depth Score (0-10) ──
  let depthScore = 0
  if (s.recursiveDepth >= RECURSIVE_DEPTH_LIMIT) {
    depthScore = Math.min((s.recursiveDepth - RECURSIVE_DEPTH_LIMIT + 1) * 5, 10)
  }
  factors.push({ name: 'recursive_depth', score: depthScore, maxScore: 10 })

  // ── Budget Exhaustion Score (0-10) ──
  const budgetScore = Math.min(Math.round(params.budgetUtilization * 10), 10)
  factors.push({ name: 'budget_exhaustion', score: budgetScore, maxScore: 10 })

  const total = factors.reduce((sum, f) => sum + f.score, 0)
  const clamped = Math.min(Math.max(total, 0), 100)

  return { score: clamped, factors }
}

export function actionFromScore(score: number): 'allow' | 'warn' | 'block' {
  if (score <= 40) return 'allow'
  if (score <= 70) return 'warn'
  return 'block'
}

export interface AgentStats {
  requestCount: number
  toolCount: number
  inputTokens: number
  outputTokens: number
  retryCount: number
  providerSwitchCount: number
  recursiveDepth: number
  consecutiveErrors: number
  lastProvider: string | null
}

export interface AgentSession {
  agentId: string
  orgId: string
  status: string
  startedAt: number
  lastRequestAt: number | null
}

export class AgentGuardService {
  // ── State Management ──

  async recordTurn(
    sessionId: string,
    input: GuardInput,
    messages: Array<{ role: string; content: string | Array<unknown> }>,
  ): Promise<AgentStats> {
    const now = input.timestamp
    const toolCountInMessage = countToolsInMessages(messages)

    try {
      const result = await valkey.eval(
        LUA_RECORD_TURN, 6,
        ValkeyKeys.agentSession(sessionId),
        ValkeyKeys.agentStats(sessionId),
        ValkeyKeys.agentTimeline(sessionId),
        ValkeyKeys.agentTools(sessionId),
        ValkeyKeys.agentProviders(sessionId),
        ValkeyKeys.agentTokenHistory(sessionId),
        now, input.inputTokens.toFixed(0), input.outputTokens.toFixed(0),
        input.provider, toolCountInMessage.toFixed(0),
        input.agentId, input.orgId,
      )
    } catch (err) {
      logger.warn({ err, sessionId }, 'Agent guard record turn failed — continuing')
    }

    return this.getStats(sessionId)
  }

  async getSession(sessionId: string): Promise<AgentSession | null> {
    try {
      const data = await valkey.hgetall(ValkeyKeys.agentSession(sessionId))
      if (!data || Object.keys(data).length === 0) return null
      return {
        agentId: data['agent_id'] ?? '',
        orgId: data['org_id'] ?? '',
        status: data['status'] ?? 'active',
        startedAt: parseInt(data['started_at'] ?? '0', 10),
        lastRequestAt: data['last_request_at'] ? parseInt(data['last_request_at'], 10) : null,
      }
    } catch {
      return null
    }
  }

  async getStats(sessionId: string): Promise<AgentStats> {
    const empty: AgentStats = {
      requestCount: 0, toolCount: 0, inputTokens: 0, outputTokens: 0,
      retryCount: 0, providerSwitchCount: 0, recursiveDepth: 0,
      consecutiveErrors: 0, lastProvider: null,
    }

    try {
      const data = await valkey.hgetall(ValkeyKeys.agentStats(sessionId))
      if (!data || Object.keys(data).length === 0) return empty
      return {
        requestCount: parseInt(data['request_count'] ?? '0', 10),
        toolCount: parseInt(data['tool_count'] ?? '0', 10),
        inputTokens: parseInt(data['input_tokens'] ?? '0', 10),
        outputTokens: parseInt(data['output_tokens'] ?? '0', 10),
        retryCount: parseInt(data['retry_count'] ?? '0', 10),
        providerSwitchCount: parseInt(data['provider_switch_count'] ?? '0', 10),
        recursiveDepth: parseInt(data['recursive_depth'] ?? '0', 10),
        consecutiveErrors: parseInt(data['consecutive_errors'] ?? '0', 10),
        lastProvider: data['last_provider'] ?? null,
      }
    } catch {
      return empty
    }
  }

  async getTimelineCount(sessionId: string): Promise<number> {
    try {
      const cutoff = Date.now() - TIMELINE_WINDOW_MS
      await valkey.zremrangebyscore(ValkeyKeys.agentTimeline(sessionId), 0, cutoff)
      return valkey.zcard(ValkeyKeys.agentTimeline(sessionId))
    } catch {
      return 0
    }
  }

  async getRecentTokens(sessionId: string): Promise<number[]> {
    try {
      const cutoff = Date.now() - TOKEN_HISTORY_WINDOW_MS
      await valkey.zremrangebyscore(ValkeyKeys.agentTokenHistory(sessionId), 0, cutoff)
      const tokens = await valkey.zrangebyscore(
        ValkeyKeys.agentTokenHistory(sessionId), cutoff, '+inf',
      )
      return tokens.map(t => parseInt(t, 10)).filter(t => !isNaN(t))
    } catch {
      return []
    }
  }

  getToolCountFromMessages(
    messages: Array<{ role: string; content: string | Array<unknown> }>,
  ): number {
    return countToolsInMessages(messages)
  }

  detectRetry(
    messages: Array<{ role: string; content: string | Array<unknown> }>,
  ): boolean {
    return detectRetry(messages)
  }

  async incrementErrors(sessionId: string): Promise<void> {
    try {
      await valkey.hincrby(ValkeyKeys.agentStats(sessionId), 'consecutive_errors', 1)
    } catch {
      // silent
    }
  }

  async incrementRetry(sessionId: string): Promise<void> {
    try {
      await valkey.hincrby(ValkeyKeys.agentStats(sessionId), 'retry_count', 1)
    } catch {
      // silent
    }
  }

  async setBlocked(sessionId: string, ttlSeconds = 120): Promise<void> {
    try {
      await valkey.setex(ValkeyKeys.agentBlocked(sessionId), ttlSeconds, '1')
      await valkey.hset(ValkeyKeys.agentSession(sessionId), 'status', 'terminated')
    } catch {
      // silent
    }
  }

  async isBlocked(sessionId: string): Promise<boolean> {
    try {
      const blocked = await valkey.get(ValkeyKeys.agentBlocked(sessionId))
      return blocked === '1'
    } catch {
      return false
    }
  }

  async setRecursiveDepth(sessionId: string, depth: number): Promise<void> {
    try {
      await valkey.hset(ValkeyKeys.agentStats(sessionId), 'recursive_depth', depth.toFixed(0))
    } catch {
      // silent
    }
  }

  async removeSession(sessionId: string): Promise<void> {
    const keys = [
      ValkeyKeys.agentSession(sessionId),
      ValkeyKeys.agentStats(sessionId),
      ValkeyKeys.agentTimeline(sessionId),
      ValkeyKeys.agentTools(sessionId),
      ValkeyKeys.agentProviders(sessionId),
      ValkeyKeys.agentTokenHistory(sessionId),
    ]
    try {
      await valkey.del(keys)
    } catch {
      // silent
    }
  }

  // ── Guard check (used by proxy) ──

  async evaluate(input: GuardInput, messages: Array<{ role: string; content: string | Array<unknown> }>): Promise<GuardResult> {
    const toolCount = this.getToolCountFromMessages(messages)
    const isRetry = this.detectRetry(messages)

    const checkInput: Parameters<typeof computeRiskScore>[0] = {
      stats: null,
      timelineCount: 0,
      recentTokens: [],
      currentInputTokens: input.inputTokens,
      currentOutputTokens: input.outputTokens,
      currentToolCount: toolCount,
      currentProvider: input.provider,
      budgetUtilization: input.budgetUtilization,
      isRetry,
    }

    const stats = await this.getStats(input.sessionId)
    if (stats.requestCount > 0) {
      checkInput.stats = stats
      checkInput.timelineCount = await this.getTimelineCount(input.sessionId)
      checkInput.recentTokens = await this.getRecentTokens(input.sessionId)
    }

    const { score, factors } = computeRiskScore(checkInput)
    const action = actionFromScore(score)

    if (action === 'block') {
      await this.setBlocked(input.sessionId)
    }

    if (isRetry) {
      await this.incrementRetry(input.sessionId)
    }

    if (isRetry && stats.requestCount > 0) {
      const prevDepth = stats.recursiveDepth
      await this.setRecursiveDepth(input.sessionId, prevDepth + 1)
    }

    return {
      score,
      action,
      factors,
      sessionId: input.sessionId,
      blocked: action === 'block',
    }
  }

  // ── List active sessions for dashboard ──

  async listActiveSessions(orgId: string): Promise<Array<{
    id: string
    agentId: string
    status: string
    turnCount: number
    tokensConsumed: number
    tokenBudget: number
    loopDetected: boolean
    riskScore: number
    startedAt: string
    terminatedAt: string | null
  }>> {
    try {
      const key = ValkeyKeys.agentSession('*').replace('*', '')
      const scanCursor = '0'
      const sessions: Array<any> = []
      let cursor = scanCursor

      do {
        const result = await valkey.scan(cursor as any, 'MATCH', `${key}*`, 'COUNT', 50)
        cursor = result[0] as string
        const keys = result[1] as string[]

        for (const k of keys) {
          const sessionData = await valkey.hgetall(k)
          if (!sessionData || sessionData['org_id'] !== orgId) continue

          const sessionId = k.split(':').pop() ?? ''
          const stats = await this.getStats(sessionId)

          sessions.push({
            id: sessionId,
            agentId: sessionData['agent_id'] ?? 'unknown',
            status: sessionData['status'] ?? 'active',
            turnCount: stats.requestCount,
            tokensConsumed: stats.inputTokens + stats.outputTokens,
            tokenBudget: 100000,
            loopDetected: false,
            riskScore: 0,
            startedAt: new Date(parseInt(sessionData['started_at'] ?? '0', 10)).toISOString(),
            terminatedAt: null,
          })
        }
      } while (cursor !== '0')

      return sessions
    } catch (err) {
      logger.warn({ err, orgId }, 'Failed to list agent sessions')
      return []
    }
  }
}

export const agentGuardService = new AgentGuardService()
