import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { callAnthropic } from '../clients/providers/anthropic.js'
import { callOpenAI } from '../clients/providers/openai.js'
import { callGemini } from '../clients/providers/gemini.js'
import { callGroq } from '../clients/providers/groq.js'
import { logger } from '../lib/logger.js'
import type { ProviderType } from '../types/index.js'
import { getModelProvider } from './model-metadata.js'
import { MODEL_ROUTES, getRoutesForModel } from './model-routes.js'
import { openRouterAdapter } from '../clients/upstreams/openrouter.js'

export interface ProviderHealthState {
  provider: ProviderType
  healthy: boolean
  lastCheckedAt: number
}

export class UnsupportedModelError extends Error {
  constructor(model: string) {
    super(`Model '${model}' is not supported`)
    this.name = 'UnsupportedModelError'
  }
}

export class ProviderUnavailableError extends Error {
  constructor(provider: string) {
    super(`Provider '${provider}' is currently unavailable`)
    this.name = 'ProviderUnavailableError'
  }
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
    const health = await this.checkProviderHealth(params.provider)
    if (!health.healthy) {
      throw new ProviderUnavailableError(params.provider)
    }

    switch (params.provider) {
      case 'anthropic':
        return callAnthropic(params)
      case 'openai':
        return callOpenAI(params)
      case 'gemini':
        return callGemini(params)
      case 'groq':
        return callGroq(params)
      case 'openrouter':
        return openRouterAdapter.chat({
          model: params.model,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
        })
      default:
        throw new Error(`Unknown provider: ${params.provider}`)
    }
  }

  async routeWithFallback(params: ProviderRouteParams): Promise<Response> {
    // Try routes in priority order with bounded retries (max 2 attempts per route, 1 fallback max)
    const routes = getRoutesForModel(params.model)
    const sorted = routes.sort((a, b) => a.priority - b.priority)
    // If no routes configured, fall back to direct provider resolution
    const candidates = sorted.length > 0 ? sorted : [{ upstreamId: params.provider, upstreamModelId: params.model, priority: 1, enabled: true, modelId: params.model }]

    let lastError: Error | null = null
    for (const route of candidates) {
      const upstreamProvider = route.upstreamId as ProviderType
      try {
        // Only attempt if route is enabled and upstream is healthy
        const health = await this.checkProviderHealth(upstreamProvider)
        if (!health.healthy) {
          logger.warn({ upstream: upstreamProvider, model: params.model }, 'Upstream unhealthy, trying next route')
          continue
        }
        const upstreamParams = {
          ...params,
          provider: upstreamProvider,
          model: route.upstreamModelId,
        }
        return await this.route(upstreamParams)
      } catch (err: any) {
        lastError = err
        const isRetryable = err instanceof ProviderUnavailableError || (err.name === 'ProviderRequestError' && (err as any).retryable)
        if (isRetryable && route !== candidates[candidates.length - 1]) {
          logger.info({ upstream: upstreamProvider, model: params.model, error: err.message }, 'Retryable upstream error; attempting fallback route')
          continue
        }
        throw err
      }
    }
    if (lastError) {
      throw lastError
    }
    throw new UnsupportedModelError(params.model)
  }

  resolveUpstream(model: string): { upstreamId: string; upstreamModelId: string; provider?: ProviderType } {
    const routes = getRoutesForModel(model)
    if (routes.length > 0) {
      // Sort by priority ascending (lower number = higher priority)
      const sorted = routes.sort((a, b) => a.priority - b.priority)
      const best = sorted[0]
      if (!best) {
        throw new UnsupportedModelError(model)
      }
      return {
        upstreamId: best.upstreamId,
        upstreamModelId: best.upstreamModelId,
        provider: best.upstreamId as ProviderType,
      }
    }

    // Fallback to legacy registry mapping for backward compatibility
    const provider = getModelProvider(model)
    if (!provider) {
      throw new UnsupportedModelError(model)
    }
    return {
      upstreamId: provider,
      upstreamModelId: model,
      provider,
    }
  }

  resolveProvider(model: string): ProviderType {
    const upstream = this.resolveUpstream(model)
    if (!upstream.provider) {
      throw new UnsupportedModelError(model)
    }
    return upstream.provider
  }

  async checkProviderHealth(provider: ProviderType): Promise<ProviderHealthState> {
    if (provider === 'openrouter') {
      const health = await openRouterAdapter.health()
      return {
        provider,
        healthy: health.healthy,
        lastCheckedAt: health.lastCheckedAt,
      }
    }
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
