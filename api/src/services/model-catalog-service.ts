import { ModelCatalog } from './model-catalog.js'
import type { CatalogSource, ModelDescriptor } from './model-catalog.js'

export interface CatalogProjection {
  descriptors: Map<string, ModelDescriptor>
  lastUpdated: number
  sourceStatus: Map<string, { healthy: boolean; lastChecked: number; error?: string }>
}

export interface ModelCatalogServiceConfig {
  sources: CatalogSource[]
  mergeStrategy?: 'precedence' | 'merge'
  sourcePrecedence?: string[]
}

export class ModelCatalogService {
  private config: ModelCatalogServiceConfig
  private projection: CatalogProjection = {
    descriptors: new Map(),
    lastUpdated: 0,
    sourceStatus: new Map(),
  }

  constructor(config: ModelCatalogServiceConfig) {
    this.config = {
      mergeStrategy: 'precedence',
      sourcePrecedence: [],
      ...config,
    }

    // Initialize with empty projection - will be populated on first refresh
    this.projection = {
      descriptors: new Map(),
      lastUpdated: 0,
      sourceStatus: new Map(),
    }
  }

  private mergeDescriptors(descriptors: ModelDescriptor[]): ModelDescriptor[] {
    const precedence = this.config.sourcePrecedence ?? this.config.sources.map(s => s.id)
    
    // Group by model ID
    const byId = new Map<string, ModelDescriptor[]>()
    for (const desc of descriptors) {
      const existing = byId.get(desc.id) ?? []
      existing.push(desc)
      byId.set(desc.id, existing)
    }

    // Resolve conflicts using precedence
    const merged: ModelDescriptor[] = []
    for (const [id, variants] of byId) {
      if (variants.length === 1) {
        const desc = variants[0]
        if (desc) merged.push(desc)
      } else {
        // Sort by source precedence
        const sorted = variants.sort((a, b) => {
          const aSourceId = (a.metadata?.sourceId as string) ?? ''
          const bSourceId = (b.metadata?.sourceId as string) ?? ''
          const aIndex = precedence.indexOf(aSourceId)
          const bIndex = precedence.indexOf(bSourceId)
          return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
        })
        const desc = sorted[0]
        if (desc) merged.push(desc)
      }
    }

    return merged
  }

  async refresh(): Promise<void> {
    const allDescriptors: ModelDescriptor[] = []
    const newSourceStatus = new Map<string, { healthy: boolean; lastChecked: number; error?: string }>()

    for (const source of this.config.sources) {
      try {
        const discovered = await source.discover()
        // Tag each descriptor with source ID for provenance
        const tagged = discovered.map(d => ({
          ...d,
          metadata: { ...d.metadata, sourceId: source.id },
        }))
        allDescriptors.push(...tagged)
        newSourceStatus.set(source.id, { healthy: true, lastChecked: Date.now() })
      } catch (error) {
        const prevStatus = this.projection.sourceStatus.get(source.id)
        newSourceStatus.set(source.id, {
          healthy: false,
          lastChecked: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Merge descriptors with deterministic precedence
    const merged = this.mergeDescriptors(allDescriptors)
    
    const descriptors = new Map<string, ModelDescriptor>()
    for (const desc of merged) {
      descriptors.set(desc.id, desc)
    }

    this.projection = {
      descriptors,
      lastUpdated: Date.now(),
      sourceStatus: newSourceStatus,
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

  getSourceStatus(sourceId: string): { healthy: boolean; lastChecked: number; error?: string } | undefined {
    return this.projection.sourceStatus.get(sourceId)
  }

  // Synchronization interface
  private syncInterval?: ReturnType<typeof setInterval>

  startPeriodicRefresh(intervalMs = 300000): void {
    this.stopPeriodicRefresh()
    this.syncInterval = setInterval(async () => {
      try {
        await this.refresh()
      } catch {
        // Failure tolerance: external catalog unavailability must not make TokenSentry unavailable.
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

// Composite source that merges multiple sources
class CompositeCatalogSource implements CatalogSource {
  id = 'composite'

  constructor(private sources: CatalogSource[]) {
    this.id = sources.map(s => s.id).join('+')
  }

  async discover(): Promise<ModelDescriptor[]> {
    const all: ModelDescriptor[] = []
    for (const source of this.sources) {
      try {
        const discovered = await source.discover()
        // Tag with source ID for provenance
        all.push(...discovered.map(d => ({ ...d, metadata: { ...d.metadata, sourceId: source.id } })))
      } catch {
        // Source failure - skip, other sources may succeed
      }
    }
    return this.mergeByPrecedence(all)
  }

  private mergeByPrecedence(descriptors: ModelDescriptor[]): ModelDescriptor[] {
    // Simple merge - first source wins for each model ID
    const seen = new Set<string>()
    const merged: ModelDescriptor[] = []
    for (const desc of descriptors) {
      if (!seen.has(desc.id)) {
        seen.add(desc.id)
        merged.push(desc)
      }
    }
    return merged
  }
}

export interface ModelCatalogServiceConfig {
  sources: CatalogSource[]
  mergeStrategy?: 'precedence' | 'merge'
  sourcePrecedence?: string[]
}

// Singleton instance - initialized lazily by catalog-bootstrap.ts
let _catalogService: ModelCatalogService | null = null

export function getCatalogService(): ModelCatalogService {
  if (!_catalogService) {
    throw new Error('ModelCatalogService not initialized. Call initializeCatalog() first.')
  }
  return _catalogService
}

export function setCatalogService(service: ModelCatalogService): void {
  _catalogService = service
}

// Export a getter that always returns the current singleton instance
export const modelCatalogService = new Proxy({} as ModelCatalogService, {
  get(target, prop) {
    const service = getCatalogService()
    return (service as any)[prop]
  }
})
