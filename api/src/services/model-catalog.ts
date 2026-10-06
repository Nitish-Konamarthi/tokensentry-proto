import type { ProviderType } from '../types/index.js'

export interface ModelDescriptor {
  id: string
  provider: ProviderType
  family: string
  tier: 'low' | 'standard' | 'high' | 'premium'
  capabilityScore: number
  cost: { input: number; output: number }
  supportsCoding?: boolean
  supportsReasoning?: boolean
  supportsVision?: boolean
  metadata?: Record<string, unknown>
}

export interface CatalogSource {
  discover(): Promise<ModelDescriptor[]>
  refresh?(): Promise<void>
}

export class ModelCatalog {
  private snapshot: ModelDescriptor[] = []

  constructor(
    private source: CatalogSource,
  ) {}

  async refresh(): Promise<void> {
    try {
      const discovered = await this.source.discover()
      this.snapshot = discovered
    } catch {
      // If discovery fails, retain existing snapshot rather than inventing data
    }
  }

  getDescriptor(modelId: string): ModelDescriptor | undefined {
    return this.snapshot.find(m => m.id === modelId)
  }

  listSupported(): string[] {
    return this.snapshot.map(m => m.id)
  }

  getByTier(tier: string): ModelDescriptor[] {
    return this.snapshot.filter(m => m.tier === tier)
  }

  getByProvider(provider: ProviderType): ModelDescriptor[] {
    return this.snapshot.filter(m => m.provider === provider)
  }

  getLowestTier(): ModelDescriptor | undefined {
    return this.snapshot.sort((a, b) => {
      const tierOrder = ['low', 'standard', 'high', 'premium']
      const indexA = tierOrder.indexOf(a.tier)
      const indexB = tierOrder.indexOf(b.tier)
      return indexA - indexB
    })[0]
  }

  getHighestTier(): ModelDescriptor | undefined {
    return this.snapshot.sort((a, b) => {
      const tierOrder = ['low', 'standard', 'high', 'premium']
      const indexA = tierOrder.indexOf(a.tier)
      const indexB = tierOrder.indexOf(b.tier)
      return indexB - indexA
    })[0]
  }

  getSupportedTiers(): string[] {
    const tiers = new Set(this.snapshot.map(m => m.tier))
    return Array.from(tiers).sort((a, b) => {
      const order = ['low', 'standard', 'high', 'premium']
      return order.indexOf(a) - order.indexOf(b)
    })
  }
}
