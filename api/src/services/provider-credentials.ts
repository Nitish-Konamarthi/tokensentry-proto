import { env } from '../config/env.js'
import type { UpstreamId } from '../types/index.js'

export async function getProviderApiKey(upstream: UpstreamId): Promise<string | undefined> {
  // Provider credentials are operator-managed server configuration in V1.
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
