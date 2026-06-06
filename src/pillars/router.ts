// src/pillars/router.ts — Pillar 1: Intelligent Router
// Routes every AI call to the cheapest capable model using Claude Haiku

import { callTokenSentryAI, type ClassifierResult, MODEL_COSTS } from '../clients/anthropic.js'
import { redis, RedisKeys, TTL } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

export const MODEL_TIER_ORDER = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
] as const

export type ModelTier = typeof MODEL_TIER_ORDER[number]

export interface RouterDecision {
  complexity: string
  recommended_model: string
  approved_model: string        // After policy enforcement
  confidence: number
  reasoning: string
  estimated_output_tokens: number
  can_use_cache: boolean
  cache_key_hint: string
  estimated_cost_usd: number
  overridden: boolean
}

export interface OrgPolicy {
  allowed_models: string[]
  max_model_tier: 'haiku' | 'sonnet' | 'opus'
  require_classification: boolean
  allow_opus: boolean
}

export class IntelligentRouter {
  // Fallback when classifier is unavailable
  private readonly FALLBACK_MODEL = 'claude-haiku-4-5'

  async route(params: {
    orgId: string
    teamId: string
    userId: string
    prompt: string
    contextTokens: number
    userTier: 'developer' | 'analyst' | 'agent' | 'admin'
    orgPolicy: OrgPolicy
    preservePriority: 'accuracy' | 'speed' | 'cost'
    requestedModel: string  // What the client originally asked for
  }): Promise<RouterDecision> {

    // If classification not required by policy, just enforce model tier
    if (!params.orgPolicy.require_classification) {
      const approved = this.enforcePolicy(
        params.requestedModel,
        params.orgPolicy.allowed_models
      )
      return {
        complexity: 'unknown',
        recommended_model: params.requestedModel,
        approved_model: approved,
        confidence: 1.0,
        reasoning: 'Classification disabled by policy',
        estimated_output_tokens: 500,
        can_use_cache: false,
        cache_key_hint: '',
        estimated_cost_usd: this.estimateCost(params.contextTokens, 500, approved),
        overridden: approved !== params.requestedModel,
      }
    }

    // Get AI classification
    let decision: ClassifierResult
    try {
      decision = await callTokenSentryAI<ClassifierResult>(
        'task_classifier',
        {
          prompt: params.prompt.slice(0, 2000),  // Truncate for classifier
          context_tokens: params.contextTokens,
          user_tier: params.userTier,
          org_max_model: params.orgPolicy.max_model_tier,
        },
        { orgId: params.orgId }
      )
    } catch (err) {
      // Classifier failure → safe fallback (never crash the proxy)
      logger.warn({ err, orgId: params.orgId }, 'Classifier failed, using fallback')
      decision = {
        complexity: 'medium',
        recommended_model: 'claude-sonnet-4-6',
        confidence: 0.5,
        reasoning: 'Classifier unavailable — fallback',
        estimated_output_tokens: 500,
        can_use_cache: false,
        cache_key_hint: 'unknown',
      }
    }

    // Enforce org policy (AI may recommend something not allowed)
    const approved = this.enforcePolicy(
      decision.recommended_model,
      params.orgPolicy.allowed_models
    )

    // If preserve_priority=accuracy and model was downgraded, reconsider
    let finalModel = approved
    if (
      params.preservePriority === 'accuracy' &&
      approved === 'claude-haiku-4-5' &&
      decision.complexity === 'high'
    ) {
      const sonnet = 'claude-sonnet-4-6'
      if (params.orgPolicy.allowed_models.includes(sonnet)) {
        finalModel = sonnet
      }
    }

    const overridden = params.requestedModel !== finalModel

    if (overridden) {
      logger.info({
        orgId: params.orgId,
        recommended: decision.recommended_model,
        approved: finalModel,
        reason: 'Policy enforcement',
      }, 'Model overridden by policy')
    }

    return {
      ...decision,
      approved_model: finalModel,
      estimated_cost_usd: this.estimateCost(
        params.contextTokens,
        decision.estimated_output_tokens,
        finalModel
      ),
      overridden,
    }
  }

  // Calculate estimated cost before making the AI call
  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS]
    if (!costs) return 0
    return (inputTokens / 1_000_000) * costs.input +
           (outputTokens / 1_000_000) * costs.output
  }

  // Calculate actual cost from token usage
  calculateActualCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    return this.estimateCost(inputTokens, outputTokens, model)
  }

  // Calculate savings vs what client originally requested
  calculateSavings(
    inputTokens: number,
    outputTokens: number,
    requestedModel: string,
    approvedModel: string
  ): number {
    if (requestedModel === approvedModel) return 0
    const requested = this.estimateCost(inputTokens, outputTokens, requestedModel)
    const approved  = this.estimateCost(inputTokens, outputTokens, approvedModel)
    return Math.max(0, requested - approved)
  }

  // Enforce org policy: downgrade if needed, never upgrade beyond allowed
  private enforcePolicy(requestedModel: string, allowedModels: string[]): string {
    if (allowedModels.includes(requestedModel)) return requestedModel

    // Walk down the tier list to find the highest allowed model
    const reqIdx = MODEL_TIER_ORDER.indexOf(requestedModel as ModelTier)
    if (reqIdx === -1) return allowedModels[0] ?? this.FALLBACK_MODEL

    for (let i = reqIdx; i >= 0; i--) {
      const model = MODEL_TIER_ORDER[i]
      if (model && allowedModels.includes(model)) return model
    }

    return allowedModels[0] ?? this.FALLBACK_MODEL
  }
}

export const intelligentRouter = new IntelligentRouter()
