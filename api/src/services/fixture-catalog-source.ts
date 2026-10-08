import type { CatalogSource, CatalogDiscoveryResult, ModelDescriptor } from './model-catalog.js'

export class FixtureCatalogSource implements CatalogSource {
  id = 'fixture'

  private models: ModelDescriptor[] = [
    { id: 'anthropic/claude-haiku-4-5', owner: 'anthropic', family: 'claude', tier: 'low', capabilityScore: 1, cost: { input: 0.80, output: 4.00 }, supportsCoding: true, supportsReasoning: true, supportsVision: true },
    { id: 'anthropic/claude-sonnet-4-6', owner: 'anthropic', family: 'claude', tier: 'high', capabilityScore: 3, cost: { input: 3.00, output: 15.00 }, supportsCoding: true, supportsReasoning: true, supportsVision: true },
    { id: 'anthropic/claude-opus-4-6', owner: 'anthropic', family: 'claude', tier: 'premium', capabilityScore: 4, cost: { input: 15.00, output: 75.00 }, supportsCoding: true, supportsReasoning: true, supportsVision: true },
    { id: 'openai/gpt-4o', owner: 'openai', family: 'gpt', tier: 'high', capabilityScore: 3, cost: { input: 2.50, output: 10.00 }, supportsCoding: true, supportsReasoning: true, supportsVision: true },
    { id: 'openai/gpt-4o-mini', owner: 'openai', family: 'gpt', tier: 'low', capabilityScore: 1, cost: { input: 0.15, output: 0.60 }, supportsCoding: true, supportsReasoning: false },
    { id: 'openai/gpt-4.1', owner: 'openai', family: 'gpt', tier: 'high', capabilityScore: 3, cost: { input: 2.00, output: 8.00 }, supportsCoding: true, supportsReasoning: true, supportsVision: true },
    { id: 'openai/gpt-4.1-mini', owner: 'openai', family: 'gpt', tier: 'low', capabilityScore: 1, cost: { input: 0.40, output: 1.60 }, supportsCoding: true, supportsReasoning: false },
    { id: 'openai/o3', owner: 'openai', family: 'o', tier: 'high', capabilityScore: 3, cost: { input: 10.00, output: 40.00 }, supportsCoding: true, supportsReasoning: true },
    { id: 'openai/o4-mini', owner: 'openai', family: 'o', tier: 'low', capabilityScore: 1, cost: { input: 1.10, output: 4.40 }, supportsCoding: false, supportsReasoning: false },
    { id: 'google/gemini-2.5-pro', owner: 'google', family: 'gemini', tier: 'high', capabilityScore: 3, cost: { input: 1.25, output: 10.00 }, supportsCoding: true, supportsReasoning: true },
    { id: 'google/gemini-2.5-flash', owner: 'google', family: 'gemini', tier: 'low', capabilityScore: 1, cost: { input: 0.15, output: 0.60 }, supportsCoding: false, supportsReasoning: false },
    { id: 'google/gemini-2.0-flash', owner: 'google', family: 'gemini', tier: 'low', capabilityScore: 1, cost: { input: 0.10, output: 0.40 }, supportsCoding: false, supportsReasoning: false },
    { id: 'groq/llama-3.1-70b', owner: 'groq', family: 'llama', tier: 'high', capabilityScore: 3, cost: { input: 0.59, output: 0.79 }, supportsCoding: true, supportsReasoning: false },
    { id: 'groq/llama-3.1-8b', owner: 'groq', family: 'llama', tier: 'low', capabilityScore: 1, cost: { input: 0.05, output: 0.08 }, supportsCoding: true, supportsReasoning: false },
  ]

  getStaticDescriptors(): ModelDescriptor[] {
    return this.models
  }

  async discover(): Promise<CatalogDiscoveryResult> {
    return { ok: true, models: this.models }
  }

  async refresh(): Promise<void> {
  }
}

export const fixtureCatalogSource = new FixtureCatalogSource()