import { modelCatalogService } from './model-catalog-service.js'

/**
 * Canonicalizes a model identifier to the standard "owner/model" format.
 * 
 * Canonical identity rules:
 * 1. If model is already in canonical form (contains "/"), verify it exists in catalog.
 * 2. Try case-insensitive match against catalog-supported models.
 * 3. Otherwise, return the input (will fail downstream validation if not in catalog).
 * 
 * The catalog is the authoritative source. MODEL_ROUTES is NOT used for canonicalization.
 */
export function canonicalizeModelId(modelId: string): string {
  // Check if it's already canonical (contains slash) - verify in catalog
  if (modelId.includes('/')) {
    const descriptor = modelCatalogService.getDescriptor(modelId)
    if (descriptor) {
      return modelId
    }
  }

  // Try case-insensitive match against catalog-supported models
  const supported = modelCatalogService.listSupported()
  for (const supportedId of supported) {
    if (supportedId.toLowerCase() === modelId.toLowerCase()) {
      return supportedId
    }
  }

  // If no canonical form found, return as-is (will fail catalog validation if not present)
  return modelId
}

/**
 * Resolves the model owner for a canonical model ID from catalog descriptor.
 */
export function getModelOwner(canonicalModelId: string): string | undefined {
  const descriptor = modelCatalogService.getDescriptor(canonicalModelId)
  if (descriptor) {
    return descriptor.owner
  }
  // Model not in catalog - do NOT infer owner from arbitrary string
  // Return undefined to signal unknown ownership
  return undefined
}

/**
 * Normalizes a requested model name to canonical form.
 * This is the primary canonicalization mechanism.
 */
export function normalizeCanonicalModel(modelName: string): string {
  return canonicalizeModelId(modelName)
}