import { env } from '../config/env.js'
import type { CatalogSource, ModelDescriptor } from '../services/model-catalog.js'

export class ModelsDevCatalogSource implements CatalogSource {
  id = 'models-dev'

  private getUrl(): string {
    return env.MODELS_DEV_API_URL || 'https://models.dev/api/v1/models'
  }

  async discover(): Promise<ModelDescriptor[]> {
    try {
      const response = await fetch(this.getUrl(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) {
        return []
      }
      const data = await response.json() as any
      // Normalize Models.dev response into ModelDescriptor
      // Hide Models.dev-specific structures from the rest of TokenSentry
      const descriptors: ModelDescriptor[] = []
      const models = Array.isArray(data) ? data : (data.models ?? [])
      for (const item of models) {
        descriptors.push({
          id: item.id || item.model_id || item.name,
          provider: item.provider || item.provider_id || 'models-dev',
          family: item.family || item.model_family || '',
          tier: item.tier || item.capability_tier || 'standard',
          capabilityScore: item.capability_score || item.score || 0,
          cost: item.cost || item.pricing || { input: 0, output: 0 },
          supportsCoding: item.supports_coding ?? true,
          supportsReasoning: item.supports_reasoning ?? true,
          supportsVision: item.supports_vision ?? false,
          metadata: item,
        })
      }
      return descriptors
    } catch {
      // If the external catalog is unavailable, return an empty projection
      // rather than making TokenSentry unavailable.
      return []
    }
  }

  async refresh(): Promise<void> {
    // Manual refresh hook; discovery is called on request-time lookup
    // via the catalog service, not on every inference request.
  }
}
