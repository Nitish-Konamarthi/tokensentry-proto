import type { ProviderType } from '../types/index.js'

export const MODEL_TIERS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] as const

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  'gpt-4o':            { input: 2.50, output: 10.00 },
  'gpt-4o-mini':       { input: 0.15, output: 0.60 },
  'gpt-4.1':           { input: 2.00, output: 8.00 },
  'gpt-4.1-mini':      { input: 0.40, output: 1.60 },
  'gemini-2.5-pro':    { input: 1.25, output: 10.00 },
  'gemini-2.5-flash':  { input: 0.15, output: 0.60 },
}

export function getModelTierIndex(model: string): number {
  return MODEL_TIERS.indexOf(model as typeof MODEL_TIERS[number])
}

export function isKnownModel(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_COSTS, model)
}
