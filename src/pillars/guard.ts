// src/pillars/guard.ts — Pillar 5: Agentic Loop Guard
// Monitors every agent turn for loops, budget violations, and runaway consumption

import { createHash } from 'crypto'
import {
  callTokenSentryAI,
  type GuardResult,
} from '../clients/anthropic.js'
import { redis, RedisKeys, TTL } from '../clients/redis.js'
import { logger } from '../utils/logger.js'
import { hashTurn } from '../utils/crypto.js'

const GUARD_ENABLED = process.env['ENABLE_AGENTIC_GUARD'] !== 'false'
const LOOP_THRESHOLD = parseFloat(
  process.env['AGENTIC_LOOP_DETECTION_THRESHOLD'] ?? '0.60'
)
const MAX_TURNS_BEFORE_REVIEW = parseInt(
  process.env['MAX_AGENT_TURNS_BEFORE_REVIEW'] ?? '30'
)

export interface AgentCheckInput {
  agentId: string
  orgId: string
  totalTokensConsumed: number
  tokenBudget: number
  turnCount: number
  lastTurnContent: string
  currentTaskDescription: string
  timeElapsedSeconds: number
}

export interface AgentCheckOutput {
  guardResult: GuardResult
  loopDetected: boolean
  loopSignature: string | null
  terminationRequired: boolean
}

export class AgenticLoopGuard {
  async checkTurn(params: AgentCheckInput): Promise<AgentCheckOutput> {
    if (!GUARD_ENABLED) {
      return {
        guardResult: {
          status: 'healthy',
          action: 'continue',
          budget_utilization: params.totalTokensConsumed / params.tokenBudget,
          estimated_tokens_to_completion: null,
          will_exceed_budget: false,
          intervention_message: '',
          context_compression_instruction: '',
          escalate_to_human: false,
          reason: 'Agentic guard disabled',
        },
        loopDetected: false,
        loopSignature: null,
        terminationRequired: false,
      }
    }

    // Step 1: Update turn hash history in Redis
    const turnHash = hashTurn(params.lastTurnContent)
    await this.recordTurnHash(params.agentId, turnHash)

    // Step 2: Detect loops from turn history
    const { loopDetected, loopSignature, consecutiveLoops } =
      await this.detectLoop(params.agentId, turnHash)

    // Step 3: Check consecutive loops (immediate termination at 3+)
    if (consecutiveLoops >= 3) {
      logger.warn({
        agentId: params.agentId,
        orgId: params.orgId,
        consecutiveLoops,
      }, 'Agent: 3+ consecutive identical turns — terminating')

      return {
        guardResult: {
          status: 'terminate',
          action: 'terminate',
          budget_utilization: params.totalTokensConsumed / params.tokenBudget,
          estimated_tokens_to_completion: null,
          will_exceed_budget: true,
          intervention_message: `Agent terminated: 3 consecutive identical turns detected. Turn hash: ${turnHash}. Task may be complete or agent is stuck. Review logs.`,
          context_compression_instruction: '',
          escalate_to_human: true,
          reason: `${consecutiveLoops} consecutive identical turns — immediate loop termination`,
        },
        loopDetected: true,
        loopSignature,
        terminationRequired: true,
      }
    }

    // Step 4: Get last 5 turns for context
    const last5Turns = await this.getRecentTurns(params.agentId)

    // Step 5: Call AI guard
    let guardResult: GuardResult
    try {
      guardResult = await callTokenSentryAI<GuardResult>(
        'agentic_guard',
        {
          agent_id: params.agentId,
          total_tokens_consumed: params.totalTokensConsumed,
          token_budget: params.tokenBudget,
          turn_count: params.turnCount,
          last_5_turns_summary: last5Turns.join(' → '),
          current_task_description: params.currentTaskDescription.slice(0, 500),
          loop_detected: loopDetected,
          loop_signature: loopSignature,
          time_elapsed_seconds: params.timeElapsedSeconds,
        },
        { orgId: params.orgId }
      )
    } catch (err) {
      // Guard failure → safe default (continue with warning)
      logger.warn({ err, agentId: params.agentId }, 'Guard AI call failed')
      const budgetUtil = params.totalTokensConsumed / params.tokenBudget
      guardResult = {
        status: budgetUtil > 0.90 ? 'terminate' : 'healthy',
        action: budgetUtil > 0.90 ? 'terminate' : 'continue',
        budget_utilization: budgetUtil,
        estimated_tokens_to_completion: null,
        will_exceed_budget: budgetUtil > 0.90,
        intervention_message: budgetUtil > 0.90
          ? 'Budget nearly exhausted. Terminating agent.'
          : '',
        context_compression_instruction: '',
        escalate_to_human: budgetUtil > 0.90,
        reason: 'Guard AI unavailable — using budget-based fallback',
      }
    }

    const terminationRequired = guardResult.action === 'terminate'

    logger.info({
      agentId: params.agentId,
      orgId: params.orgId,
      status: guardResult.status,
      action: guardResult.action,
      budgetUtil: guardResult.budget_utilization,
      loopDetected,
      turnCount: params.turnCount,
    }, 'Agent guard check complete')

    return {
      guardResult,
      loopDetected,
      loopSignature,
      terminationRequired,
    }
  }

  // Record turn hash in Redis sliding window (last 10 turns)
  private async recordTurnHash(agentId: string, hash: string): Promise<void> {
    const key = RedisKeys.agentLoops(agentId)
    await redis.multi()
      .rpush(key, hash)
      .ltrim(key, -10, -1)    // Keep only last 10
      .expire(key, TTL.AGENT_SESSION_SECONDS)
      .exec()
  }

  // Detect loops from last 10 turn hashes
  private async detectLoop(
    agentId: string,
    currentHash: string
  ): Promise<{
    loopDetected: boolean
    loopSignature: string | null
    consecutiveLoops: number
  }> {
    const key = RedisKeys.agentLoops(agentId)
    const hashes = await redis.lrange(key, 0, -1)

    if (hashes.length < 3) {
      return { loopDetected: false, loopSignature: null, consecutiveLoops: 0 }
    }

    // Count duplicates in last 10 turns
    const hashCounts = new Map<string, number>()
    for (const h of hashes) {
      hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1)
    }

    const duplicateRatio = Array.from(hashCounts.values())
      .filter(count => count > 1)
      .reduce((sum, count) => sum + count, 0) / hashes.length

    // Consecutive loops: check last N turns all identical
    let consecutiveLoops = 0
    const reversed = [...hashes].reverse()
    for (const h of reversed) {
      if (h === currentHash) consecutiveLoops++
      else break
    }

    const loopDetected = duplicateRatio >= LOOP_THRESHOLD

    // Find the dominant loop signature
    let loopSignature: string | null = null
    if (loopDetected) {
      const dominant = Array.from(hashCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]
      loopSignature = dominant ? `hash:${dominant[0]}, count:${dominant[1]}` : null
    }

    return { loopDetected, loopSignature, consecutiveLoops }
  }

  // Get recent turn summaries for context
  private async getRecentTurns(agentId: string): Promise<string[]> {
    const key = RedisKeys.agentTurns(agentId)
    return redis.lrange(key, -5, -1)
  }

  // Record a turn summary (call this alongside checkTurn)
  async recordTurnSummary(agentId: string, summary: string): Promise<void> {
    const key = RedisKeys.agentTurns(agentId)
    await redis.multi()
      .rpush(key, summary.slice(0, 200))
      .ltrim(key, -5, -1)
      .expire(key, TTL.AGENT_SESSION_SECONDS)
      .exec()
  }
}

export const agenticGuard = new AgenticLoopGuard()
