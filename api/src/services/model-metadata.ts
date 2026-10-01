import type { ProviderType } from '../types/index.js'

export interface ModelMetadata {
  provider: ProviderType
  family: string
  tier: 'low' | 'standard' | 'high' | 'premium'
  capabilityScore: number   // 1=low, 2=standard, 3=high, 4=premium
  cost: { input: number; output: number }
  supportsCoding?: boolean
  supportsReasoning?: boolean
  supportsVision?: boolean
}

export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  // Anthropic
  'claude-haiku-4-5': {
    provider: 'anthropic', family: 'claude', tier: 'low', capabilityScore: 1,
    cost: { input: 0.80, output: 4.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic', family: 'claude', tier: 'high', capabilityScore: 3,
    cost: { input: 3.00, output: 15.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'claude-opus-4-6': {
    provider: 'anthropic', family: 'claude', tier: 'premium', capabilityScore: 4,
    cost: { input: 15.00, output: 75.00 }, supportsCoding: true, supportsReasoning: true,
  },
  // OpenAI
  'gpt-4o': {
    provider: 'openai', family: 'gpt', tier: 'high', capabilityScore: 3,
    cost: { input: 2.50, output: 10.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'gpt-4o-mini': {
    provider: 'openai', family: 'gpt', tier: 'low', capabilityScore: 1,
    cost: { input: 0.15, output: 0.60 }, supportsCoding: true, supportsReasoning: false,
  },
  'gpt-4.1': {
    provider: 'openai', family: 'gpt', tier: 'high', capabilityScore: 3,
    cost: { input: 2.00, output: 8.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'gpt-4.1-mini': {
    provider: 'openai', family: 'gpt', tier: 'low', capabilityScore: 1,
    cost: { input: 0.40, output: 1.60 }, supportsCoding: true, supportsReasoning: false,
  },
  'o3': {
    provider: 'openai', family: 'o', tier: 'high', capabilityScore: 3,
    cost: { input: 10.00, output: 40.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'o4-mini': {
    provider: 'openai', family: 'o', tier: 'low', capabilityScore: 1,
    cost: { input: 1.10, output: 4.40 }, supportsCoding: false, supportsReasoning: false,
  },
  // Gemini
  'gemini-2.5-pro': {
    provider: 'gemini', family: 'gemini', tier: 'high', capabilityScore: 3,
    cost: { input: 1.25, output: 10.00 }, supportsCoding: true, supportsReasoning: true,
  },
  'gemini-2.5-flash': {
    provider: 'gemini', family: 'gemini', tier: 'low', capabilityScore: 1,
    cost: { input: 0.15, output: 0.60 }, supportsCoding: false, supportsReasoning: false,
  },
  'gemini-2.0-flash': {
    provider: 'gemini', family: 'gemini', tier: 'low', capabilityScore: 1,
    cost: { input: 0.10, output: 0.40 }, supportsCoding: false, supportsReasoning: false,
  },
}

export const MODEL_COSTS: Record<string, { input: number; output: number }> = Object.fromEntries(
  Object.entries(MODEL_REGISTRY).map(([model, meta]) => [model, meta.cost])
)

export const MODEL_TIERS = ['low', 'standard', 'high', 'premium'] as const

export function getModelMetadata(model: string): ModelMetadata | undefined {
  return MODEL_REGISTRY[model]
}

export function getModelTier(model: string): typeof MODEL_TIERS[number] | undefined {
  return MODEL_REGISTRY[model]?.tier
}

export function getModelProvider(model: string): ProviderType | undefined {
  return MODEL_REGISTRY[model]?.provider
}

export function getModelFamily(model: string): string | undefined {
  return MODEL_REGISTRY[model]?.family
}

export function getCapabilityScore(model: string): number {
  // Unknown/unregistered models have NO trustworthy capability
  return MODEL_REGISTRY[model]?.capabilityScore ?? 0
}

export function getModelTierIndex(model: string): number {
  const tier = getModelTier(model)
  if (!tier) return -1
  return MODEL_TIERS.indexOf(tier)
}

export function isKnownModel(model: string): boolean {
  return model in MODEL_REGISTRY
}

export function getAllowedModels(allowedModels?: string[]): { permitted: string[]; hasRestriction: boolean; unsupportedConfigured: string[] } {
  if (!allowedModels || allowedModels.length === 0) {
    return { permitted: Object.keys(MODEL_REGISTRY), hasRestriction: false, unsupportedConfigured: [] }
  }
  const permitted = allowedModels.filter(m => isKnownModel(m))
  const unsupportedConfigured = allowedModels.filter(m => !isKnownModel(m))
  return { permitted, hasRestriction: true, unsupportedConfigured }
}

export function getBestPermittedModel(
  allowedModels: string[],
  requestedModel: string,
  preservePriority?: 'cost' | 'speed' | 'accuracy',
  maxModelTier?: string
): string {
  // Filter to only permitted known models
  const permitted = allowedModels.filter(m => isKnownModel(m))
  if (permitted.length === 0) {
    // No valid permitted candidates exist. Return empty/unknown rather than inventing a Claude default.
    return ''
  }

  // Apply max_model_tier constraint if configured
  let constrainedPermitted = permitted
  if (maxModelTier) {
    const maxTierIndex = MODEL_TIERS.indexOf(maxModelTier as typeof MODEL_TIERS[number])
    if (maxTierIndex >= 0) {
      constrainedPermitted = permitted.filter(m => {
        const meta = MODEL_REGISTRY[m]!
        return MODEL_TIERS.indexOf(meta.tier) <= maxTierIndex
      })
    }
  }

  const permittedToSelect = constrainedPermitted.length > 0 ? constrainedPermitted : []

  // If requested is permitted, return it
  if (permittedToSelect.includes(requestedModel)) return requestedModel

  // No valid permitted candidates exist (either no permitted models configured,
  // or max_model_tier eliminated all permitted candidates, or policy has only unsupported models)
  if (permittedToSelect.length === 0) {
    return ''
  }

  // Determine selection strategy
  const metaRequested = MODEL_REGISTRY[requestedModel]
  const requestedTier = metaRequested?.tier
  const requestedProvider = metaRequested?.provider

  // Sort permitted models by tier level (ascending for cost/speed, descending for accuracy)
  const sorted = permittedToSelect.slice().sort((a, b) => {
    const metaA = MODEL_REGISTRY[a]!
    const metaB = MODEL_REGISTRY[b]!
    const tierA = MODEL_TIERS.indexOf(metaA.tier)
    const tierB = MODEL_TIERS.indexOf(metaB.tier)

    if (preservePriority === 'cost' || preservePriority === 'speed') {
      // For cost/speed: prefer lower tier (cheaper/faster), then same provider
      if (tierA !== tierB) return tierA - tierB
      // Same tier: prefer same provider as requested
      if (requestedProvider && metaA.provider === requestedProvider && metaB.provider !== requestedProvider) return -1
      if (requestedProvider && metaB.provider === requestedProvider && metaA.provider !== requestedProvider) return 1
      return 0
    } else {
      // For accuracy/default: prefer closest tier match to requested
      // Find closest permitted tier to requested tier
      if (requestedTier) {
        const requestedIndex = MODEL_TIERS.indexOf(requestedTier)
        const diffA = Math.abs(tierA - requestedIndex)
        const diffB = Math.abs(tierB - requestedIndex)
        if (diffA !== diffB) return diffA - diffB
        // Same tier distance: prefer same provider
        if (requestedProvider && metaA.provider === requestedProvider && metaB.provider !== requestedProvider) return -1
        if (requestedProvider && metaB.provider === requestedProvider && metaA.provider !== requestedProvider) return 1
        return 0
      }
      // Default: prefer highest tier (best capability)
      return tierB - tierA
    }
  })

  return sorted[0] ?? permittedToSelect[0] ?? ''
}
