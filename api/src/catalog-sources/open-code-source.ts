import { env } from '../config/env.js'
import type { CatalogSource, ModelDescriptor } from '../services/model-catalog.js'

export class OpenCodeCatalogSource implements CatalogSource {
  id = 'opencode'

  private getUrl(): string {
    return env.OPENCODE_API_URL || 'https://opencode.dev/api/v1/models'
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
      const descriptors: ModelDescriptor[] = []
      // Do NOT depend on private OpenCode databases, internal SQLite structures,
      // or undocumented endpoints. Use only supported public interfaces.
      const models = Array.isArray(data) ? data : (data.results ?? [])
      for (const item of models) {
        descriptors.push({
          id: item.id || item.model || item.name,
          provider: item.provider || item.source || 'opencode',
          family: item.family || item.model_family || '',
          tier: item.tier || item.capacity || 'standard',
          capabilityScore: item.score || item.capability || 0,
          cost: item.cost || item.pricing || { input: 0, output: 0 },
          supportsCoding: item.coding ?? true,
          supportsReasoning: item.reasoning ?? true,
          supportsVision: item.vision ?? false,
          metadata: item,
        })
      }
      return descriptors
    } catch {
      return []
    }
  }

  async refresh(): Promise<void> {
    // Manual refresh hook.
  }
}
