import { env } from '../config/env.js'
import { getValkey } from '../clients/valkey.js'
import { decrypt } from '../lib/crypto.js'
import type { ProviderType } from '../types/index.js'

const PROVIDER_KEYS_PREFIX = 'provider:keys:'

export async function getProviderApiKey(provider: ProviderType, orgId?: string): Promise<string | undefined> {
  // If orgId provided, check for organization-specific key first
  if (orgId) {
    try {
      const valkey = getValkey()
      const encryptedKey = await valkey.hget(`${PROVIDER_KEYS_PREFIX}${orgId}`, provider)
      if (encryptedKey) {
        return decrypt(encryptedKey)
      }
    } catch {
      // Fall through to environment variable
    }
  }

  // Fallback to environment variable
  switch (provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY || undefined
    case 'openai':
      return env.OPENAI_API_KEY || undefined
    case 'gemini':
      return env.GEMINI_API_KEY || undefined
    case 'groq':
      return env.GROQ_API_KEY || undefined
    default:
      return undefined
  }
}
