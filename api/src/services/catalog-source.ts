import { MODEL_REGISTRY } from './model-metadata.js'
import type { CatalogSource, ModelDescriptor } from './model-catalog.js'

/**
 * RegistryCatalogSource derives descriptors from the legacy MODEL_REGISTRY.
 * For V1, MODEL_REGISTRY is no longer the authoritative source of truth for routing.
 * It serves as an operational descriptor layer that feeds the catalog projection.
 * New models should be added through CatalogSource implementations (e.g., ModelsDevCatalogSource, OpenCodeCatalogSource)
 * rather than by editing MODEL_REGISTRY directly.
 */
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
