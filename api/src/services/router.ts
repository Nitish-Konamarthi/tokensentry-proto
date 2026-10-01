import type { AuthContext } from '../types/index.js'
import { providerScoringEngine } from './provider-scoring.js'
import type { ProviderScore as ProviderScoringEngineScore } from './provider-scoring.js'
import { MODEL_COSTS, MODEL_TIERS } from './model-metadata.js'

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
}

interface PolicyModelScore {
  model: string
  score: number
}

class PolicyEvaluator {
  evaluate(params: {
    requestedModel: string
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
  }): PolicyEvaluation {
    const allowedModels = params.orgPolicy.allowed_models ?? Object.keys(MODEL_COSTS)
    const requestedModel = params.requestedModel
    return {
      requestedModel,
      allowedModels,
      isRequestedAllowed: allowedModels.includes(requestedModel),
    }
  }
}

class ProviderScorer {
  scoreProviders(params: { models: string[] }): PolicyModelScore[] {
    return params.models.map((model) => ({
      model,
      score: this.scoreModel(model),
    }))
  }

  private scoreModel(model: string): number {
    const tierIndex = MODEL_TIERS.findIndex((tier) => tier === model as typeof MODEL_TIERS[number])
    if (tierIndex === -1) return 0
    return tierIndex + 1
  }
}

class ModelSelector {
  selectModel(params: {
    evaluation: PolicyEvaluation
    scoredProviders: PolicyModelScore[]
  }): string {
    if (params.evaluation.isRequestedAllowed) {
      return params.evaluation.requestedModel
    }

    const highestScore = Math.max(...params.scoredProviders.map((provider) => provider.score))
    const topProviders = params.scoredProviders.filter((provider) => provider.score === highestScore)
    return topProviders[0]?.model ?? params.evaluation.allowedModels[0] ?? 'claude-haiku-4-5'
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
      const allowed = evaluation.allowedModels.filter((m) => Object.prototype.hasOwnProperty.call(MODEL_COSTS, m))
      if (allowed.length > 0) {
        const sorted = allowed.slice().sort((a, b) => {
          const costA = MODEL_COSTS[a]
          const costB = MODEL_COSTS[b]
          if (!costA || !costB) return (costA ? -1 : (costB ? 1 : 0))
          const totalA = params.contextTokens * costA.input + params.outputTokens * costA.output
          const totalB = params.contextTokens * costB.input + params.outputTokens * costB.output
          return totalA - totalB
        })
        approvedModel = sorted[0] ?? 'claude-haiku-4-5'
        reasoning = `Model ${evaluation.requestedModel} not allowed by policy (allowed: [${allowed.join(', ')}]). Using cheapest allowed: ${approvedModel}.`
      } else {
        approvedModel = 'claude-haiku-4-5'
        reasoning = `Model ${evaluation.requestedModel} not allowed and no allowed models configured. Using default fallback: ${approvedModel}.`
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
    const costs = MODEL_COSTS[model]
    if (!costs) return 0
    return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
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
