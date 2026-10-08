import { env } from '../config/env.js'
import type { CatalogSource, CatalogDiscoveryResult, ModelDescriptor } from '../services/model-catalog.js'
import { z } from 'zod'

// Zod schema for Models.dev API response
const ModelsDevModelSchema = z.object({
  id: z.string().optional(),
  model_id: z.string().optional(),
  name: z.string().optional(),
  provider: z.string().optional(),
  provider_id: z.string().optional(),
  family: z.string().optional(),
  model_family: z.string().optional(),
  tier: z.string().optional(),
  capability_tier: z.string().optional(),
  capability_score: z.number().optional(),
  score: z.number().optional(),
  cost: z.object({ input: z.number(), output: z.number() }).optional(),
  pricing: z.object({ input: z.number(), output: z.number() }).optional(),
  supports_coding: z.boolean().optional(),
  supports_reasoning: z.boolean().optional(),
  supports_vision: z.boolean().optional(),
})

const ModelsDevResponseSchema = z.union([
  z.array(ModelsDevModelSchema),
  z.object({ models: z.array(ModelsDevModelSchema) }),
])

// Pricing sentinel for unknown pricing - distinct from $0
const UNKNOWN_PRICING = { input: Number.NaN, output: Number.NaN } as const

function isUnknownPricing(pricing: { input: number; output: number }): boolean {
  return Number.isNaN(pricing.input) && Number.isNaN(pricing.output)
}

export { isUnknownPricing }

export class ModelsDevCatalogSource implements CatalogSource {
  id = 'models-dev'

  private getUrl(): string {
    return env.MODELS_DEV_API_URL || 'https://models.dev/api/v1/models'
  }

  async discover(): Promise<CatalogDiscoveryResult> {
    try {
      const response = await fetch(this.getUrl(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) {
        return { ok: false, error: `Models.dev returned HTTP ${response.status}` }
      }
      const rawData = await response.json()
      
      // Validate response schema
      const parseResult = ModelsDevResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        return { ok: false, error: `Models.dev response validation failed: ${parseResult.error.message}` }
      }
      
      const data = parseResult.data
      const descriptors: ModelDescriptor[] = []
      const models = Array.isArray(data) ? data : (data.models ?? [])
      
      for (const item of models) {
        // Skip records with empty/missing model ID
        const modelId = item.id || item.model_id || item.name
        if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
          continue // Skip malformed records
        }
        
        // Validate owner
        const owner = item.provider || item.provider_id
        if (!owner || typeof owner !== 'string' || owner.trim() === '') {
          continue // Skip records with unknown owner
        }
        
        // Handle pricing - use UNKNOWN_PRICING sentinel instead of defaulting to $0
        let cost = UNKNOWN_PRICING
        if (item.cost && typeof item.cost.input === 'number' && typeof item.cost.output === 'number') {
          cost = { input: item.cost.input, output: item.cost.output }
        } else if (item.pricing && typeof item.pricing.input === 'number' && typeof item.pricing.output === 'number') {
          cost = { input: item.pricing.input, output: item.pricing.output }
        }
        
        descriptors.push({
          id: modelId.trim(),
          owner: owner.trim(),
          family: (item.family || item.model_family || '').trim(),
          tier: (item.tier || item.capability_tier || 'standard') as 'low' | 'standard' | 'high' | 'premium',
          capabilityScore: item.capability_score ?? item.score ?? 0,
          cost,
          supportsCoding: item.supports_coding ?? true,
          supportsReasoning: item.supports_reasoning ?? true,
          supportsVision: item.supports_vision ?? false,
          metadata: item,
        })
      }
      return { ok: true, models: descriptors }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async refresh(): Promise<void> {
  }
}
