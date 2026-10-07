export interface ModelRoute {
  modelId: string
  upstreamId: string
  upstreamModelId: string
  priority: number
  enabled: boolean
  metadata?: Record<string, unknown>
}

export const MODEL_ROUTES: ModelRoute[] = [
  // Anthropic routes via direct provider
  { modelId: 'claude-haiku-4-5', upstreamId: 'anthropic', upstreamModelId: 'claude-haiku-4-5', priority: 1, enabled: true },
  { modelId: 'claude-sonnet-4-6', upstreamId: 'anthropic', upstreamModelId: 'claude-sonnet-4-6', priority: 1, enabled: true },
  { modelId: 'claude-opus-4-6', upstreamId: 'anthropic', upstreamModelId: 'claude-opus-4-6', priority: 1, enabled: true },

  // Anthropic routes via OpenRouter upstream (example multi-route)
  { modelId: 'anthropic/claude-sonnet-4-6', upstreamId: 'openrouter', upstreamModelId: 'anthropic/claude-sonnet-4-6', priority: 2, enabled: true },

  // OpenAI routes via direct provider
  { modelId: 'gpt-4o', upstreamId: 'openai', upstreamModelId: 'gpt-4o', priority: 1, enabled: true },
  { modelId: 'gpt-4o-mini', upstreamId: 'openai', upstreamModelId: 'gpt-4o-mini', priority: 1, enabled: true },
  { modelId: 'gpt-4.1', upstreamId: 'openai', upstreamModelId: 'gpt-4.1', priority: 1, enabled: true },
  { modelId: 'gpt-4.1-mini', upstreamId: 'openai', upstreamModelId: 'gpt-4.1-mini', priority: 1, enabled: true },
  { modelId: 'o3', upstreamId: 'openai', upstreamModelId: 'o3', priority: 1, enabled: true },
  { modelId: 'o4-mini', upstreamId: 'openai', upstreamModelId: 'o4-mini', priority: 1, enabled: true },

  // OpenAI routes via OpenRouter upstream (example multi-route)
  { modelId: 'openai/gpt-4o', upstreamId: 'openrouter', upstreamModelId: 'openai/gpt-4o', priority: 2, enabled: true },

  // Gemini routes via direct provider
  { modelId: 'gemini-2.5-pro', upstreamId: 'gemini', upstreamModelId: 'gemini-2.5-pro', priority: 1, enabled: true },
  { modelId: 'gemini-2.5-flash', upstreamId: 'gemini', upstreamModelId: 'gemini-2.5-flash', priority: 1, enabled: true },
  { modelId: 'gemini-2.0-flash', upstreamId: 'gemini', upstreamModelId: 'gemini-2.0-flash', priority: 1, enabled: true },

  // Aliases mapped to canonical model identity
  { modelId: 'claude-sonnet-4-6-alias', upstreamId: 'anthropic', upstreamModelId: 'claude-sonnet-4-6', priority: 1, enabled: true },
]

export function getRoutesForModel(modelId: string): ModelRoute[] {
  return MODEL_ROUTES.filter(r => r.modelId === modelId && r.enabled)
}

export function getCanonicalModelId(modelId: string): string {
  // If an exact route exists, use it. Otherwise check if modelId contains a slash
  // which indicates a canonical identity already.
  const exact = MODEL_ROUTES.find(r => r.modelId === modelId)
  if (exact) return exact.modelId
  return modelId
}
