import type { ModelOwner } from '../types/index.js'

/**
 * @deprecated Legacy ModelMetadata type - kept only for migration compatibility.
 * Use ModelDescriptor from model-catalog.ts instead.
 */
export interface ModelMetadata {
  owner: ModelOwner
  family: string
  tier: 'low' | 'standard' | 'high' | 'premium'
  capabilityScore: number
  cost: { input: number; output: number }
  supportsCoding?: boolean
  supportsReasoning?: boolean
  supportsVision?: boolean
}

export const MODEL_TIERS = ['low', 'standard', 'high', 'premium'] as const

export function getModelTierIndex(tier: string): number {
  return MODEL_TIERS.indexOf(tier as typeof MODEL_TIERS[number])
}
