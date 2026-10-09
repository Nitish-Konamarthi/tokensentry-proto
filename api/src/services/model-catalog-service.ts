import type { CatalogSource, ModelDescriptor } from './model-catalog.js'
import { isUnknownPricing } from './catalog-pricing.js'

function isValidDescriptor(descriptor: ModelDescriptor): boolean {
  const tiers = ['low', 'standard', 'high', 'premium']
  const validCost = !descriptor.cost || (
    isUnknownPricing(descriptor.cost)
    || Number.isFinite(descriptor.cost.input) && descriptor.cost.input >= 0
      && Number.isFinite(descriptor.cost.output) && descriptor.cost.output >= 0
  )
  return Boolean(
    descriptor.id.trim()
    && descriptor.owner.trim()
    && (!descriptor.tier || tiers.includes(descriptor.tier))
    && validCost,
  )
}

export interface SourceSnapshot {
  status: 'healthy' | 'unhealthy'
  lastSuccessfulRefresh: number
  models: ModelDescriptor[]
  error?: string
}

export interface CatalogProjection {
  descriptors: Map<string, ModelDescriptor>
  lastUpdated: number
  sourceStatus: Map<string, { healthy: boolean; lastChecked: number; error?: string }>
}

export type CatalogHealthStatus = 'healthy' | 'degraded' | 'unavailable'

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
  private sourceSnapshots: Map<string, SourceSnapshot> = new Map()

  constructor(config: ModelCatalogServiceConfig) {
    this.config = {
      mergeStrategy: 'precedence',
      sourcePrecedence: [],
      ...config,
    }
  }

  private mergeDescriptors(descriptors: ModelDescriptor[]): ModelDescriptor[] {
    const precedence = this.config.sourcePrecedence ?? this.config.sources.map(s => s.id)

    const byId = new Map<string, ModelDescriptor[]>()
    for (const desc of descriptors) {
      const existing = byId.get(desc.id) ?? []
      existing.push(desc)
      byId.set(desc.id, existing)
    }

    const merged: ModelDescriptor[] = []
    for (const [id, variants] of byId) {
      if (variants.length === 1) {
        const desc = variants[0]
        if (desc) merged.push(desc)
      } else {
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
    const newSourceStatus = new Map<string, { healthy: boolean; lastChecked: number; error?: string }>()

    for (const source of this.config.sources) {
      try {
        const result = await source.discover()

        if (result.ok && result.models.length > 0 && result.models.every(isValidDescriptor)) {
          const tagged = result.models.map(d => ({
            ...d,
            metadata: { ...d.metadata, sourceId: source.id },
          }))
          this.sourceSnapshots.set(source.id, {
            status: 'healthy',
            lastSuccessfulRefresh: Date.now(),
            models: tagged,
          })
          newSourceStatus.set(source.id, { healthy: true, lastChecked: Date.now() })
        } else {
          const errorMessage = result.ok
            ? 'Catalog source returned no models or invalid metadata'
            : result.error
          const prev = this.sourceSnapshots.get(source.id)
          if (prev) {
            this.sourceSnapshots.set(source.id, {
              ...prev,
              status: 'unhealthy',
              error: errorMessage,
            })
            newSourceStatus.set(source.id, {
              healthy: false,
              lastChecked: Date.now(),
              error: errorMessage,
            })
          } else {
            this.sourceSnapshots.set(source.id, {
              status: 'unhealthy',
              lastSuccessfulRefresh: 0,
              models: [],
              error: errorMessage,
            })
            newSourceStatus.set(source.id, {
              healthy: false,
              lastChecked: Date.now(),
              error: errorMessage,
            })
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const prev = this.sourceSnapshots.get(source.id)
        if (prev) {
          this.sourceSnapshots.set(source.id, {
            ...prev,
            status: 'unhealthy',
            error: errorMessage,
          })
        } else {
          this.sourceSnapshots.set(source.id, {
            status: 'unhealthy',
            lastSuccessfulRefresh: 0,
            models: [],
            error: errorMessage,
          })
        }
        newSourceStatus.set(source.id, {
          healthy: false,
          lastChecked: Date.now(),
          error: errorMessage,
        })
      }
    }

    const allDescriptors: ModelDescriptor[] = []
    for (const snapshot of this.sourceSnapshots.values()) {
      allDescriptors.push(...snapshot.models)
    }

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

  getSourceSnapshot(sourceId: string): SourceSnapshot | undefined {
    return this.sourceSnapshots.get(sourceId)
  }

  getCatalogHealth(): CatalogHealthStatus {
    const snapshots = Array.from(this.sourceSnapshots.values())
    if (snapshots.length === 0) return 'unavailable'

    const healthyCount = snapshots.filter(s => s.status === 'healthy').length
    if (healthyCount === snapshots.length) return 'healthy'
    if (healthyCount > 0) return 'degraded'

    // All sources unhealthy: distinguish degraded (stale data available) from unavailable
    const hasUsableData = this.projection.descriptors.size > 0
    return hasUsableData ? 'degraded' : 'unavailable'
  }

}

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

export const modelCatalogService = new Proxy({} as ModelCatalogService, {
  get(target, prop) {
    const service = getCatalogService()
    return (service as any)[prop]
  },
})
