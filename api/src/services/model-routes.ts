import { modelCatalogService } from './model-catalog-service.js'

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
  { modelId: 'anthropic/claude-haiku-4-5', upstreamId: 'anthropic-direct', upstreamModelId: 'claude-haiku-4-5', priority: 1, enabled: true },
  { modelId: 'anthropic/claude-sonnet-4-6', upstreamId: 'anthropic-direct', upstreamModelId: 'claude-sonnet-4-6', priority: 1, enabled: true },
  { modelId: 'anthropic/claude-opus-4-6', upstreamId: 'anthropic-direct', upstreamModelId: 'claude-opus-4-6', priority: 1, enabled: true },

  // Anthropic routes via OpenRouter upstream
  { modelId: 'anthropic/claude-sonnet-4-6', upstreamId: 'openrouter', upstreamModelId: 'anthropic/claude-sonnet-4-6', priority: 2, enabled: true },
  { modelId: 'anthropic/claude-opus-4-6', upstreamId: 'openrouter', upstreamModelId: 'anthropic/claude-opus-4-6', priority: 2, enabled: true },

  // OpenAI routes via direct provider
  { modelId: 'openai/gpt-4o', upstreamId: 'openai-direct', upstreamModelId: 'gpt-4o', priority: 1, enabled: true },
  { modelId: 'openai/gpt-4o-mini', upstreamId: 'openai-direct', upstreamModelId: 'gpt-4o-mini', priority: 1, enabled: true },
  { modelId: 'openai/gpt-4.1', upstreamId: 'openai-direct', upstreamModelId: 'gpt-4.1', priority: 1, enabled: true },
  { modelId: 'openai/gpt-4.1-mini', upstreamId: 'openai-direct', upstreamModelId: 'gpt-4.1-mini', priority: 1, enabled: true },
  { modelId: 'openai/o3', upstreamId: 'openai-direct', upstreamModelId: 'o3', priority: 1, enabled: true },
  { modelId: 'openai/o4-mini', upstreamId: 'openai-direct', upstreamModelId: 'o4-mini', priority: 1, enabled: true },

  // OpenAI routes via OpenRouter upstream
  { modelId: 'openai/gpt-4o', upstreamId: 'openrouter', upstreamModelId: 'openai/gpt-4o', priority: 2, enabled: true },

  // Google routes via direct provider
  { modelId: 'google/gemini-2.5-pro', upstreamId: 'gemini-direct', upstreamModelId: 'gemini-2.5-pro', priority: 1, enabled: true },
  { modelId: 'google/gemini-2.5-flash', upstreamId: 'gemini-direct', upstreamModelId: 'gemini-2.5-flash', priority: 1, enabled: true },
  { modelId: 'google/gemini-2.0-flash', upstreamId: 'gemini-direct', upstreamModelId: 'gemini-2.0-flash', priority: 1, enabled: true },

  // Groq routes via direct provider
  { modelId: 'groq/llama-3.1-70b', upstreamId: 'groq-direct', upstreamModelId: 'llama-3.1-70b', priority: 1, enabled: true },
  { modelId: 'groq/llama-3.1-8b', upstreamId: 'groq-direct', upstreamModelId: 'llama-3.1-8b', priority: 1, enabled: true },
]

export function getRoutesForModel(modelId: string): ModelRoute[] {
  return MODEL_ROUTES.filter(r => r.modelId === modelId && r.enabled)
}

/**
 * Canonicalizes a model identifier to the standard "owner/model" format.
 * Uses the catalog as the authoritative source for model existence.
 * Does NOT fall back to MODEL_ROUTES for canonicalization.
 */
export async function getCanonicalModelId(modelId: string): Promise<string> {
  // If already in canonical form (contains slash), verify it exists in catalog
  if (modelId.includes('/')) {
    const descriptor = modelCatalogService.getDescriptor(modelId)
    if (descriptor) {
      return modelId
    }
  }

  // Try to find in catalog by case-insensitive match
  const supported = modelCatalogService.listSupported()
  for (const supportedId of supported) {
    if (supportedId.toLowerCase() === modelId.toLowerCase()) {
      return supportedId
    }
  }

  // If not found in catalog, return as-is (will fail downstream validation)
  return modelId
}

/**
 * Synchronous version for cases where async is not possible.
 * Checks catalog synchronously.
 */
export function getCanonicalModelIdSync(modelId: string): string {
  // If already in canonical form, verify it exists in catalog
  if (modelId.includes('/')) {
    const descriptor = modelCatalogService.getDescriptor(modelId)
    if (descriptor) {
      return modelId
    }
  }

  // Try case-insensitive match
  const supported = modelCatalogService.listSupported()
  for (const supportedId of supported) {
    if (supportedId.toLowerCase() === modelId.toLowerCase()) {
      return supportedId
    }
  }

  return modelId
}