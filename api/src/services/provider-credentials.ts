import { env } from '../config/env.js'
import { getValkey } from '../clients/valkey.js'
import { decrypt } from '../lib/crypto.js'
import type { UpstreamId } from '../types/index.js'

const UPSTREAM_KEYS_PREFIX = 'upstream:keys:'

export async function getProviderApiKey(upstream: UpstreamId, orgId?: string): Promise<string | undefined> {
  // If orgId provided, check for organization-specific key first
  if (orgId) {
    try {
      const valkey = getValkey()
      const encryptedKey = await valkey.hget(`${UPSTREAM_KEYS_PREFIX}${orgId}`, upstream)
      if (encryptedKey) {
        return decrypt(encryptedKey)
      }
    } catch {
      // Fall through to environment variable
    }
  }

  // Fallback to environment variable
  switch (upstream) {
    case 'anthropic-direct':
      return env.ANTHROPIC_API_KEY || undefined
    case 'openai-direct':
      return env.OPENAI_API_KEY || undefined
    case 'gemini-direct':
      return env.GEMINI_API_KEY || undefined
    case 'groq-direct':
      return env.GROQ_API_KEY || undefined
    case 'openrouter':
      return env.OPENROUTER_API_KEY || undefined
    default:
      return undefined
  }
}
