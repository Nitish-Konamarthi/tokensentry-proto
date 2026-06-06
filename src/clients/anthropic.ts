// src/clients/anthropic.ts
// Anthropic SDK client
// Two modes:
//   1. TokenSentry governance meta-calls → delegated to free-llm.ts (Groq/Gemini first)
//   2. Customer proxy calls → always uses the customer's own decrypted API key

import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPTS, type TSMode } from '../prompts.js'
import { logger } from '../utils/logger.js'
import { callPillarAI } from './free-llm.js'

// Model selection per prompt mode (from §3)
const MODE_MODELS: Record<TSMode, string> = {
  task_classifier: 'claude-haiku-4-5',
  prompt_optimizer: 'claude-haiku-4-5',
  agentic_guard: 'claude-haiku-4-5',
  anomaly_detector: 'claude-haiku-4-5',
  waste_analyzer: 'claude-sonnet-4-6',
  budget_advisor: 'claude-sonnet-4-6',
  cost_forecaster: 'claude-sonnet-4-6',
}

const MODE_MAX_TOKENS: Record<TSMode, number> = {
  task_classifier: 256,
  prompt_optimizer: 4096,
  agentic_guard: 512,
  anomaly_detector: 512,
  waste_analyzer: 3000,
  budget_advisor: 1000,
  cost_forecaster: 1500,
}

// Cost per million tokens (for meta-cost tracking)
export const MODEL_COSTS = {
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
} as const

export type SupportedModel = keyof typeof MODEL_COSTS

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const costs = MODEL_COSTS[model as SupportedModel]
  if (!costs) return 0
  return (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
}

// Custom error types
export class TSAIParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TSAIParseError'
  }
}

export class TSAITimeoutError extends Error {
  constructor(mode: string) {
    super(`AI call timed out for mode: ${mode}`)
    this.name = 'TSAITimeoutError'
  }
}

// ─── TOKENSENTRY META-CALL HELPER ─────────────────────────────────────────
// Called for all 7 governance prompts (classifier, optimizer, guard, etc.)
// Uses TokenSentry's own Anthropic API key — not the customer's key

// ─── TOKENSENTRY META-CALL HELPER ─────────────────────────────────────────
// Now delegates to callPillarAI() which uses FREE models first:
//   Groq (14,400 req/day free) → Gemini Flash (1M tok/day free)
//   → Cloudflare Workers AI (free) → Anthropic Haiku (paid, last resort)
// This cuts meta-call costs from ~$170/month to ~$0.
export async function callTokenSentryAI<T>(
  mode: TSMode,
  payload: Record<string, unknown>,
  context?: { orgId?: string; teamId?: string }
): Promise<T> {
  const systemPrompt = SYSTEM_PROMPTS[mode]
  const start = Date.now()

  try {
    const result = await callPillarAI<T>(mode, systemPrompt, payload)
    logger.debug({
      mode,
      latencyMs: Date.now() - start,
      orgId: context?.orgId,
    }, 'TS meta-call complete (free stack)')
    return result
  } catch (err) {
    logger.error({ err, mode, orgId: context?.orgId }, 'TS AI call failed (all providers)')
    throw err
  }
}

// ─── CUSTOMER PROXY CALL ──────────────────────────────────────────────────
// Makes the actual AI call on behalf of the customer.
// Uses their decrypted API key — TokenSentry never stores it in plaintext.

export async function proxyCustomerCall(params: {
  customerApiKey: string
  approvedModel: string
  messages: Anthropic.MessageParam[]
  optimizedSystem?: string
  maxTokens: number
  stream: boolean
  signal?: AbortSignal
}): Promise<Anthropic.Message | ReturnType<typeof customerAnthropicInstance['messages']['stream']>> {

  const customerAnthropic = new Anthropic({
    apiKey: params.customerApiKey,
    maxRetries: 2,
    timeout: 120_000,
  })

  const base = {
    model: params.approvedModel,
    max_tokens: params.maxTokens,
    messages: params.messages,
  }

  const requestParams: Anthropic.MessageCreateParamsNonStreaming = params.optimizedSystem != null
    ? { ...base, system: params.optimizedSystem }
    : base

  if (params.stream) {
    return customerAnthropic.messages.stream(requestParams)
  }

  return customerAnthropic.messages.create(requestParams)
}

// Needed for type extraction above
const customerAnthropicInstance = new Anthropic({ apiKey: '' })

// ─── CLASSIFIER RESULT TYPE ───────────────────────────────────────────────
export interface ClassifierResult {
  complexity: 'low' | 'medium' | 'high' | 'frontier'
  recommended_model: string
  confidence: number
  reasoning: string
  estimated_output_tokens: number
  can_use_cache: boolean
  cache_key_hint: string
}

// ─── OPTIMIZER RESULT TYPE ────────────────────────────────────────────────
export interface OptimizerResult {
  optimized_prompt: string
  pruned_history: Array<{ role: string; content: string; turn_index: number }>
  original_token_estimate: number
  optimized_token_estimate: number
  reduction_percentage: number
  optimizations_applied: string[]
  semantic_integrity_score: number
  compression_notes: string
}

// ─── GUARD RESULT TYPE ────────────────────────────────────────────────────
export interface GuardResult {
  status: 'healthy' | 'warning' | 'critical' | 'terminate'
  action: 'continue' | 'compress_context' | 'summarize_and_restart' | 'terminate'
  budget_utilization: number
  estimated_tokens_to_completion: number | null
  will_exceed_budget: boolean
  intervention_message: string
  context_compression_instruction: string
  escalate_to_human: boolean
  reason: string
}
