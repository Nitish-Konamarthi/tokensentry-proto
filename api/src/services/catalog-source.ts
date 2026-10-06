import { MODEL_REGISTRY } from './model-metadata.js'
import type { CatalogSource, ModelDescriptor } from './model-catalog.js'

export class RegistryCatalogSource implements CatalogSource {
  async discover(): Promise<ModelDescriptor[]> {
    return Object.entries(MODEL_REGISTRY).map(([id, meta]) => ({
      id,
      provider: meta.provider,
      family: meta.family,
      tier: meta.tier,
      capabilityScore: meta.capabilityScore,
      cost: meta.cost,
      supportsCoding: (meta as any).supportsCoding ?? true,
      supportsReasoning: (meta as any).supportsReasoning ?? true,
      supportsVision: (meta as any).supportsVision ?? false,
    }))
  }
}
