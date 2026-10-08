import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { callAnthropic } from '../clients/providers/anthropic.js'
import { callOpenAI } from '../clients/providers/openai.js'
import { callGemini } from '../clients/providers/gemini.js'
import { callGroq } from '../clients/providers/groq.js'
import { logger } from '../lib/logger.js'
import { MODEL_ROUTES, getRoutesForModel } from './model-routes.js'
import { openRouterAdapter } from '../clients/upstreams/openrouter.js'
import type { UpstreamId } from '../types/index.js'

export interface UpstreamHealthState {
  upstream: UpstreamId
  healthy: boolean
  lastCheckedAt: number
}

export class UnsupportedModelError extends Error {
  constructor(model: string) {
    super(`Model '${model}' is not supported`)
    this.name = 'UnsupportedModelError'
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(upstream: UpstreamId) {
    super(`Upstream '${upstream}' is currently unavailable`)
    this.name = 'UpstreamUnavailableError'
  }
}

interface UpstreamRouteParams {
  upstream: UpstreamId
  upstreamModelId: string
  apiKey: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export class ProviderRouterService {
  async route(params: UpstreamRouteParams): Promise<Response> {
    // Check upstream health before calling
    const health = await this.checkUpstreamHealth(params.upstream)
    if (!health.healthy) {
      throw new UpstreamUnavailableError(params.upstream)
    }

    switch (params.upstream) {
      case 'anthropic-direct':
        return callAnthropic({
          model: params.upstreamModelId,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
          apiKey: params.apiKey,
        })
      case 'openai-direct':
        return callOpenAI({
          model: params.upstreamModelId,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
          apiKey: params.apiKey,
        })
      case 'gemini-direct':
        return callGemini({
          model: params.upstreamModelId,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
          apiKey: params.apiKey,
        })
      case 'groq-direct':
        return callGroq({
          model: params.upstreamModelId,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
          apiKey: params.apiKey,
        })
      case 'openrouter':
        return openRouterAdapter.chat({
          model: params.upstreamModelId,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
        })
      default:
        throw new Error(`Unknown upstream: ${params.upstream}`)
    }
  }

  async routeWithFallback(params: {
    model: string
    apiKey: string
    messages: Array<{ role: string; content: string }>
    system?: string
    maxTokens?: number
    temperature?: number
    stream?: boolean
  }): Promise<Response> {
    // Try routes in priority order with bounded retries
    const routes = getRoutesForModel(params.model)
    if (routes.length === 0) {
      throw new UnsupportedModelError(params.model)
    }
    const sorted = routes.sort((a, b) => a.priority - b.priority)
    const candidates = sorted

    let lastError: Error | null = null
    for (const route of candidates) {
      try {
        // Only attempt if route is enabled and upstream is healthy
        const health = await this.checkUpstreamHealth(route.upstreamId)
        if (!health.healthy) {
          logger.warn({ upstream: route.upstreamId, model: params.model }, 'Upstream unhealthy, trying next route')
          continue
        }
        const upstreamParams = {
          upstream: route.upstreamId,
          upstreamModelId: route.upstreamModelId,
          apiKey: params.apiKey,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
        }
        return await this.route(upstreamParams)
      } catch (err: any) {
        lastError = err
        const isRetryable = this.isRetryableError(err)
        if (isRetryable && route !== candidates[candidates.length - 1]) {
          logger.info({ upstream: route.upstreamId, model: params.model, error: err.message }, 'Retryable upstream error; attempting fallback route')
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

  /**
   * Classifies errors as retryable or non-retryable.
   * Retryable: timeout, network failure, temporary unavailable, 5xx
   * Non-retryable: auth failure, invalid API key, malformed request, policy rejection, budget rejection, unsupported model, Agent Guard block
   */
  private isRetryableError(err: any): boolean {
    if (err instanceof UpstreamUnavailableError) return true
    if (err.name === 'ProviderRequestError' && err.retryable) return true
    // Network errors, timeouts, 5xx errors are retryable
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true
    if (err.status >= 500 && err.status < 600) return true
    // Auth failures, bad requests, policy/budget rejections are NOT retryable
    if (err.status === 401 || err.status === 403 || err.status === 400 || err.status === 402 || err.status === 429) return false
    return false
  }

  resolveUpstream(model: string): { upstreamId: UpstreamId; upstreamModelId: string } {
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
      }
    }

    // No routes found - model is not routable through any upstream
    throw new UnsupportedModelError(model)
  }

  async checkUpstreamHealth(upstream: UpstreamId): Promise<UpstreamHealthState> {
    if (upstream === 'openrouter') {
      const health = await openRouterAdapter.health()
      return {
        upstream,
        healthy: health.healthy,
        lastCheckedAt: health.lastCheckedAt,
      }
    }
    const healthy = await this.getUpstreamHealth(upstream)
    return {
      upstream,
      healthy,
      lastCheckedAt: Date.now(),
    }
  }

  private async getUpstreamHealth(upstream: string): Promise<boolean> {
    const key = ValkeyKeys.providerHealth(upstream)
    const status = await valkey.get(key)
    if (status === 'unhealthy') {
      logger.warn({ upstream }, 'Upstream marked unhealthy')
      return false
    }
    return true
  }

  async markUpstreamError(upstream: UpstreamId): Promise<void> {
    const key = ValkeyKeys.providerHealth(upstream)
    await valkey.setex(key, 300, 'unhealthy') // 5 min cooldown
    logger.error({ upstream }, 'Upstream marked unhealthy')
  }
}

export const providerRouter = new ProviderRouterService()
