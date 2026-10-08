import { ModelCatalog } from './model-catalog.js'
import type { CatalogSource, CatalogDiscoveryResult, ModelDescriptor } from './model-catalog.js'

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

        if (result.ok) {
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
          const prev = this.sourceSnapshots.get(source.id)
          if (prev) {
            // Source failed - retain models (last-known-good)
            // Only mark snapshot unhealthy if it has no models (was empty success)
            const hasModels = prev.models.length > 0
            this.sourceSnapshots.set(source.id, {
              ...prev,
              status: hasModels ? 'healthy' : 'unhealthy',
              error: result.error,
            })
            newSourceStatus.set(source.id, {
              healthy: false,
              lastChecked: Date.now(),
              error: result.error,
            })
          } else {
            this.sourceSnapshots.set(source.id, {
              status: 'unhealthy',
              lastSuccessfulRefresh: 0,
              models: [],
              error: result.error,
            })
            newSourceStatus.set(source.id, {
              healthy: false,
              lastChecked: Date.now(),
              error: result.error,
            })
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const prev = this.sourceSnapshots.get(source.id)
        if (prev) {
          // Source failed - retain models (last-known-good)
          // Only mark snapshot unhealthy if it has no models (was empty success)
          const hasModels = prev.models.length > 0
          this.sourceSnapshots.set(source.id, {
            ...prev,
            status: hasModels ? 'healthy' : 'unhealthy',
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
    return 'unavailable'
  }

  private syncInterval?: ReturnType<typeof setInterval>

  startPeriodicRefresh(intervalMs = 300000): void {
    this.stopPeriodicRefresh()
    this.syncInterval = setInterval(async () => {
      try {
        await this.refresh()
      } catch {
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

class CompositeCatalogSource implements CatalogSource {
  id = 'composite'

  constructor(private sources: CatalogSource[]) {
    this.id = sources.map(s => s.id).join('+')
  }

  async discover(): Promise<CatalogDiscoveryResult> {
    const all: ModelDescriptor[] = []
    let hasFailure = false
    let lastError = ''

    for (const source of this.sources) {
      try {
        const result = await source.discover()
        if (result.ok) {
          all.push(...result.models.map(d => ({ ...d, metadata: { ...d.metadata, sourceId: source.id } })))
        } else {
          hasFailure = true
          lastError = result.error
        }
      } catch (err) {
        hasFailure = true
        lastError = err instanceof Error ? err.message : 'Unknown error'
      }
    }

    if (hasFailure && all.length === 0) {
      return { ok: false, error: lastError }
    }

    return { ok: true, models: this.mergeByPrecedence(all) }
  }

  private mergeByPrecedence(descriptors: ModelDescriptor[]): ModelDescriptor[] {
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
