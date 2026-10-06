import { env } from '../config/env.js'
import type { ProviderType } from '../types/index.js'

export function getProviderApiKey(provider: ProviderType): string | undefined {
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
