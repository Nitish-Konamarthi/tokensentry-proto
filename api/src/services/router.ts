import type { AuthContext } from '../types/index.js'
import { canonicalizeModelId } from './canonicalize.js'
import { modelCatalogService } from './model-catalog-service.js'
import { isUnknownPricing } from '../catalog-sources/models-dev-source.js'

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
  hasRestriction: boolean
  unsupportedConfigured: string[]
}

class PolicyEvaluator {
  evaluate(params: {
    requestedModel: string
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
  }): PolicyEvaluation {
    const canonicalRequested = canonicalizeModelId(params.requestedModel)
    const descriptor = modelCatalogService.getDescriptor(canonicalRequested)
    const allowedResult = this.getAllowedModels(params.orgPolicy.allowed_models)
    const allowedModels = allowedResult.permitted
    const requestedModel = canonicalRequested

    return {
      requestedModel,
      allowedModels,
      isRequestedAllowed: allowedModels.includes(canonicalRequested),
      requestedTier: descriptor?.tier,
      requestedProvider: descriptor?.owner,
      hasRestriction: allowedResult.hasRestriction,
      unsupportedConfigured: allowedResult.unsupportedConfigured,
    }
  }

  private getAllowedModels(allowedModels?: string[]): { permitted: string[]; hasRestriction: boolean; unsupportedConfigured: string[] } {
    if (!allowedModels || allowedModels.length === 0) {
      // No restriction configured: all supported catalog models are permitted
      const allSupported = modelCatalogService.listSupported()
      return { permitted: allSupported, hasRestriction: false, unsupportedConfigured: [] }
    }

    // Resolve canonical IDs and check catalog support
    const permitted: string[] = []
    const unsupportedConfigured: string[] = []

    for (const model of allowedModels) {
      const canonical = canonicalizeModelId(model)
      if (modelCatalogService.isSupported(canonical)) {
        permitted.push(canonical)
      } else {
        unsupportedConfigured.push(model)
      }
    }

    return { permitted, hasRestriction: true, unsupportedConfigured }
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
    const canonicalRequested = canonicalizeModelId(params.requestedModel)
    const descriptor = modelCatalogService.getDescriptor(canonicalRequested)

    // Unknown/unregistered models must be rejected before provider execution
    if (!descriptor) {
      const complexity = params.contextTokens > 8000 ? 'high' : (params.contextTokens > 2000 ? 'moderate' : 'low')
      return {
        approvedModel: '',
        complexity,
        confidence: 1.0,
        reasoning: `Model ${params.requestedModel} (canonical: ${canonicalRequested}) is not supported in the model catalog.`,
        overridden: false,
        estimatedCostUsd: 0,
      }
    }

    const evaluation = this.policyEvaluator.evaluate(params)

    // Determine permitted models based on policy using catalog descriptors
    let permitted = evaluation.allowedModels
    if (evaluation.hasRestriction) {
      permitted = evaluation.allowedModels.filter(id => modelCatalogService.isSupported(id))
    }

    // Enforce max_model_tier if configured
    if (params.orgPolicy.max_model_tier) {
      permitted = permitted.filter(m => {
        const meta = modelCatalogService.getDescriptor(m)
        if (!meta?.tier) return false
        const tierOrder = ['low', 'standard', 'high', 'premium']
        const maxIndex = tierOrder.indexOf(params.orgPolicy.max_model_tier as typeof tierOrder[number])
        const modelIndex = tierOrder.indexOf(meta.tier as typeof tierOrder[number])
        return maxIndex >= 0 && modelIndex >= 0 && modelIndex <= maxIndex
      })
    }

    // Handle unsupported configured allowed_models
    const hasUnsupportedConfigured = evaluation.unsupportedConfigured.length > 0

    // Check if requested model is still permitted after max_model_tier filtering
    const requestedStillPermitted = permitted.includes(evaluation.requestedModel)

    let approvedModel = evaluation.requestedModel
    let reasoning = 'Requested model is allowed by policy'
    let overridden = false

    if (!evaluation.isRequestedAllowed || !requestedStillPermitted) {
      overridden = true
      if (permitted.length > 0) {
        approvedModel = this.selectBestPermittedModel(
          permitted,
          evaluation.requestedModel,
          params.preservePriority ?? 'accuracy',
          params.orgPolicy.max_model_tier
        )
        if (!evaluation.isRequestedAllowed) {
          reasoning = `Model ${evaluation.requestedModel} not allowed by policy (allowed: [${permitted.join(', ')}]). Using best permitted: ${approvedModel}.`
        } else {
          reasoning = `Model ${evaluation.requestedModel} exceeds max_model_tier ${params.orgPolicy.max_model_tier} (allowed: [${permitted.join(', ')}]). Using best permitted: ${approvedModel}.`
        }
      } else if (hasUnsupportedConfigured) {
        approvedModel = ''
        reasoning = `Model ${evaluation.requestedModel} not allowed. Policy configured unsupported models (${evaluation.unsupportedConfigured.join(', ')}). No supported permitted model available.`
      } else {
        approvedModel = ''
        reasoning = `Model ${evaluation.requestedModel} not allowed and no permitted models available. No supported fallback.`
      }
    }

    const complexity = params.contextTokens > 8000 ? 'high' : (params.contextTokens > 2000 ? 'moderate' : 'low')
    const modelDescriptor = modelCatalogService.getDescriptor(approvedModel)
    const costDescriptor = modelDescriptor?.cost
    let estimatedCostUsd = 0
    if (modelDescriptor && costDescriptor && !isUnknownPricing(costDescriptor)) {
      estimatedCostUsd = (params.contextTokens / 1_000_000) * costDescriptor.input + (params.outputTokens / 1_000_000) * costDescriptor.output
    }
    // Unknown pricing -> estimatedCostUsd = 0 (will fail closed at budget check)

    return {
      approvedModel,
      complexity,
      confidence: 1.0,
      reasoning,
      overridden,
      estimatedCostUsd,
    }
  }

  private selectBestPermittedModel(
    permitted: string[],
    requestedModel: string,
    preservePriority: 'cost' | 'speed' | 'accuracy' | 'accuracy' | 'speed' | 'cost',
    maxModelTier?: string
  ): string {
    // Filter to permitted models supported by catalog
    const permittedFromCatalog = permitted.filter(m => modelCatalogService.isSupported(m))
    
    if (permittedFromCatalog.length === 0) return ''

    const descriptorRequested = modelCatalogService.getDescriptor(requestedModel)
    const requestedTier = descriptorRequested?.tier
    const requestedProvider = descriptorRequested?.owner

    // Sort permitted models by catalog descriptor metadata
    const sorted = permittedFromCatalog.slice().sort((a, b) => {
      const metaA = modelCatalogService.getDescriptor(a)
      const metaB = modelCatalogService.getDescriptor(b)
      
      if (!metaA || !metaB) return 0
      
      const tierA = metaA.tier ?? 'standard'
      const tierB = metaB.tier ?? 'standard'
      const tierOrder = ['low', 'standard', 'high', 'premium']
      const tierIndexA = tierOrder.indexOf(tierA)
      const tierIndexB = tierOrder.indexOf(tierB)

      if (preservePriority === 'cost' || preservePriority === 'speed') {
        if (tierIndexA !== tierIndexB) return tierIndexA - tierIndexB
        // Prefer same owner as requested
        const ownerA = metaA.owner ?? ''
        const ownerB = metaB.owner ?? ''
        if (requestedProvider && ownerA === requestedProvider && ownerB !== requestedProvider) return -1
        if (requestedProvider && ownerB === requestedProvider && ownerA !== requestedProvider) return 1
        return 0
      } else {
        if (requestedTier) {
          const requestedIndex = tierOrder.indexOf(requestedTier)
          const diffA = Math.abs(tierIndexA - requestedIndex)
          const diffB = Math.abs(tierIndexB - requestedIndex)
          if (diffA !== diffB) return diffA - diffB
          // Prefer same owner
          const ownerA = metaA.owner ?? ''
          const ownerB = metaB.owner ?? ''
          if (requestedProvider && ownerA === requestedProvider && ownerB !== requestedProvider) return -1
          if (requestedProvider && ownerB === requestedProvider && ownerA !== requestedProvider) return 1
          return 0
        }
        return tierIndexB - tierIndexA
      }
    })

    return sorted[0] ?? permittedFromCatalog[0] ?? ''
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const descriptor = modelCatalogService.getDescriptor(model)
    if (!descriptor || !descriptor.cost) return 0
    if (isUnknownPricing(descriptor.cost)) return 0 // Unknown pricing -> $0 estimate (fail closed at budget)
    return (inputTokens / 1_000_000) * descriptor.cost.input + (outputTokens / 1_000_000) * descriptor.cost.output
  }

  calculateSavings(inputTokens: number, outputTokens: number, fromModel: string, toModel: string): number {
    if (fromModel === toModel) return 0
    const fromDescriptor = modelCatalogService.getDescriptor(fromModel)
    const toDescriptor = modelCatalogService.getDescriptor(toModel)
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
