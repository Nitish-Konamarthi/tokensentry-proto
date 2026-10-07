import { ModelCatalog } from './model-catalog.js'
import { RegistryCatalogSource } from './catalog-source.js'
import { MODEL_REGISTRY } from './model-metadata.js'
import type { CatalogSource, ModelDescriptor } from './model-catalog.js'

export interface CatalogProjection {
  descriptors: Map<string, ModelDescriptor>
  lastUpdated: number
}

export class ModelCatalogService {
  private catalog: ModelCatalog
  private projection: CatalogProjection = {
    descriptors: new Map(),
    lastUpdated: 0,
  }

  constructor(sources: CatalogSource[] = [new RegistryCatalogSource()]) {
    // Create a composite catalog that discovers from the first available source
    // For V1, we use a single source that can be swapped later.
    const source = sources[0] ?? new RegistryCatalogSource()
    this.catalog = new ModelCatalog(source)
    // Initialize projection from registry descriptors for fast lookup until refresh completes
    const descriptors = new Map<string, ModelDescriptor>()
    // Initialize synchronously from MODEL_REGISTRY for operational projection
    for (const [id, meta] of Object.entries(MODEL_REGISTRY)) {
      descriptors.set(id, {
        id,
        provider: meta.provider,
        family: meta.family,
        tier: meta.tier,
        capabilityScore: meta.capabilityScore,
        cost: meta.cost,
        supportsCoding: (meta as any).supportsCoding ?? true,
        supportsReasoning: (meta as any).supportsReasoning ?? true,
        supportsVision: (meta as any).supportsVision ?? false,
      })
    }
    this.projection = {
      descriptors,
      lastUpdated: Date.now(),
    }
  }

  async refresh(): Promise<void> {
    await this.catalog.refresh()
    const descriptors = new Map<string, ModelDescriptor>()
    const supported = this.catalog.listSupported()
    for (const modelId of supported) {
      const descriptor = this.catalog.getDescriptor(modelId)
      if (descriptor) {
        descriptors.set(modelId, descriptor)
      }
    }
    this.projection = {
      descriptors,
      lastUpdated: Date.now(),
    }
  }

  getDescriptor(modelId: string): ModelDescriptor | undefined {
    return this.projection.descriptors.get(modelId)
  }

  listSupported(): string[] {
    return Array.from(this.projection.descriptors.keys())
  }

  isSupported(modelId: string): boolean {
    return this.projection.descriptors.has(modelId)
  }

  getProjection(): CatalogProjection {
    return this.projection
  }

  getCatalog(): ModelCatalog {
    return this.catalog
  }

  // Synchronization interface for V1
  private syncInterval?: ReturnType<typeof setInterval>

  startPeriodicRefresh(intervalMs = 300000): void {
    // Default: refresh every 5 minutes
    this.stopPeriodicRefresh()
    this.syncInterval = setInterval(async () => {
      try {
        await this.refresh()
      } catch {
        // Failure tolerance: external catalog unavailability must not
        // make TokenSentry unavailable.
      }
    }, intervalMs)
  }

  stopPeriodicRefresh(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = undefined
    }
  }

  async manualRefresh(): Promise<void> {
    await this.refresh()
  }
}

export const modelCatalogService = new ModelCatalogService()
