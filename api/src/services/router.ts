import type { AuthContext } from '../types/index.js'
import { MODEL_REGISTRY, MODEL_TIERS, getBestPermittedModel, getAllowedModels, getModelMetadata, isKnownModel } from './model-metadata.js'

export interface RouterDecision {
  approvedModel: string
  complexity: string
  confidence: number
  reasoning: string
  overridden: boolean
  estimatedCostUsd: number
}

interface PolicyEvaluation {
  requestedModel: string
  allowedModels: string[]
  isRequestedAllowed: boolean
  requestedTier?: string
  requestedProvider?: string
}

class PolicyEvaluator {
  evaluate(params: {
    requestedModel: string
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
  }): PolicyEvaluation {
    const allowedModels = getAllowedModels(params.orgPolicy.allowed_models)
    const requestedModel = params.requestedModel
    const meta = getModelMetadata(requestedModel)
    return {
      requestedModel,
      allowedModels,
      isRequestedAllowed: allowedModels.includes(requestedModel),
      requestedTier: meta?.tier,
      requestedProvider: meta?.provider,
    }
  }
}

class Router {
  constructor(
    private readonly policyEvaluator = new PolicyEvaluator(),
  ) {}

  async route(params: {
    requestedModel: string
    contextTokens: number
    outputTokens: number
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
    preservePriority?: 'accuracy' | 'speed' | 'cost'
  }): Promise<RouterDecision> {
    const evaluation = this.policyEvaluator.evaluate(params)

    let approvedModel = evaluation.requestedModel
    let reasoning = 'Requested model is allowed by policy'
    let overridden = false

    if (!evaluation.isRequestedAllowed) {
      overridden = true
      const permitted = evaluation.allowedModels.filter(isKnownModel)
      if (permitted.length > 0) {
        approvedModel = getBestPermittedModel(
          permitted,
          evaluation.requestedModel,
          params.preservePriority ?? 'accuracy'
        )
        reasoning = `Model ${evaluation.requestedModel} not allowed by policy (allowed: [${permitted.join(', ')}]). Using best permitted: ${approvedModel}.`
      } else {
        approvedModel = 'claude-haiku-4-5'
        reasoning = `Model ${evaluation.requestedModel} not allowed and no permitted models configured. Using default fallback: ${approvedModel}.`
      }
    }

    const complexity = params.contextTokens > 8000 ? 'high' : (params.contextTokens > 2000 ? 'moderate' : 'low')

    return {
      approvedModel,
      complexity,
      confidence: 1.0,
      reasoning,
      overridden,
      estimatedCostUsd: this.estimateCost(params.contextTokens, params.outputTokens, approvedModel),
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const meta = getModelMetadata(model)
    if (!meta || !meta.cost) return 0
    return (inputTokens / 1_000_000) * meta.cost.input + (outputTokens / 1_000_000) * meta.cost.output
  }

  calculateSavings(inputTokens: number, outputTokens: number, fromModel: string, toModel: string): number {
    if (fromModel === toModel) return 0
    const fromCost = this.estimateCost(inputTokens, outputTokens, fromModel)
    const toCost = this.estimateCost(inputTokens, outputTokens, toModel)
    return Math.max(0, fromCost - toCost)
  }
}

export class RouterService {
  private readonly router = new Router()

  async route(params: {
    requestedModel: string
    contextTokens: number
    outputTokens: number
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
    preservePriority?: 'accuracy' | 'speed' | 'cost'
  }): Promise<RouterDecision> {
    return this.router.route(params)
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return this.router.estimateCost(inputTokens, outputTokens, model)
  }

  calculateSavings(inputTokens: number, outputTokens: number, fromModel: string, toModel: string): number {
    return this.router.calculateSavings(inputTokens, outputTokens, fromModel, toModel)
  }
}

export const routerService = new RouterService()
