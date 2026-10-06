import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { callAnthropic } from '../clients/providers/anthropic.js'
import { callOpenAI } from '../clients/providers/openai.js'
import { callGemini } from '../clients/providers/gemini.js'
import { callGroq } from '../clients/providers/groq.js'
import { logger } from '../lib/logger.js'
import type { ProviderType } from '../types/index.js'
import { getModelProvider, MODEL_REGISTRY } from './model-metadata.js'

export interface ProviderHealthState {
  provider: ProviderType
  healthy: boolean
  lastCheckedAt: number
}

interface ProviderRouteParams {
  provider: ProviderType
  model: string
  apiKey: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export class ProviderRouterService {
  async route(params: ProviderRouteParams): Promise<Response> {
    // Check provider health before calling
    const healthy = await this.checkProviderHealth(params.provider)

    switch (params.provider) {
      case 'anthropic':
        return callAnthropic(params)
      case 'openai':
        return callOpenAI(params)
      case 'gemini':
        return callGemini(params)
      case 'groq':
        return callGroq(params)
      default:
        throw new Error(`Unknown provider: ${params.provider}`)
    }
  }

  resolveProvider(model: string): ProviderType {
    const provider = getModelProvider(model)
    if (provider) return provider
    return 'openai' // safe generic default for unsupported/unknown models
  }

  async checkProviderHealth(provider: ProviderType): Promise<ProviderHealthState> {
    const healthy = await this.getProviderHealth(provider)
    return {
      provider,
      healthy,
      lastCheckedAt: Date.now(),
    }
  }

  private async getProviderHealth(provider: string): Promise<boolean> {
    const key = ValkeyKeys.providerHealth(provider)
    const status = await valkey.get(key)
    if (status === 'unhealthy') {
      logger.warn({ provider }, 'Provider marked unhealthy')
      return false
    }
    return true
  }

  async markProviderError(provider: string): Promise<void> {
    const key = ValkeyKeys.providerHealth(provider)
    await valkey.setex(key, 300, 'unhealthy') // 5 min cooldown
    logger.error({ provider }, 'Provider marked unhealthy')
  }
}

export const providerRouter = new ProviderRouterService()
