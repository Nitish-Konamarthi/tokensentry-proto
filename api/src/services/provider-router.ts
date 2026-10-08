import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { callAnthropic } from '../clients/providers/anthropic.js'
import { callOpenAI } from '../clients/providers/openai.js'
import { callGemini } from '../clients/providers/gemini.js'
import { callGroq } from '../clients/providers/groq.js'
import { logger } from '../lib/logger.js'
import { MODEL_ROUTES, getRoutesForModel } from './model-routes.js'
import { openRouterAdapter } from '../clients/upstreams/openrouter.js'
import type { UpstreamId } from '../types/index.js'
import { modelCatalogService } from './model-catalog-service.js'
import { getProviderApiKey } from './provider-credentials.js'
import { normalizeErrorCategory, type NormalizedErrorCategory } from './error-taxonomy.js'

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

export interface RouteAttempt {
  attemptNumber: number
  upstream: string
  upstreamModelId: string
  routePriority: number
  success: boolean
  errorCategory?: NormalizedErrorCategory
  errorMessage?: string
}

export interface RouteExecutionResult {
  response: Response
  finalRoute: { upstreamId: string; upstreamModelId: string; priority: number }
  attempts: RouteAttempt[]
  fallbackUsed: boolean
  fallbackUpstream?: string
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

interface RouteCandidate {
  upstreamId: string
  upstreamModelId: string
  priority: number
  isDynamic: boolean
}

export class ProviderRouterService {
  async route(params: UpstreamRouteParams): Promise<Response> {
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
          apiKey: params.apiKey,
        })
      default:
        throw new Error(`Unknown upstream: ${params.upstream}`)
    }
  }

  async routeWithFallback(params: {
    model: string
    orgId: string
    messages: Array<{ role: string; content: string }>
    system?: string
    maxTokens?: number
    temperature?: number
    stream?: boolean
  }): Promise<RouteExecutionResult> {
    const candidates = this.resolveRouteCandidates(params.model)
    if (candidates.length === 0) {
      throw new UnsupportedModelError(params.model)
    }

    const attempts: RouteAttempt[] = []
    let lastError: Error | null = null

    for (let i = 0; i < candidates.length; i++) {
      const route = candidates[i]!
      const attemptNumber = i + 1

      try {
        const health = await this.checkUpstreamHealth(route.upstreamId)
        if (!health.healthy) {
          logger.warn({ upstream: route.upstreamId, model: params.model }, 'Upstream unhealthy, skipping route')
          attempts.push({
            attemptNumber,
            upstream: route.upstreamId,
            upstreamModelId: route.upstreamModelId,
            routePriority: route.priority,
            success: false,
            errorCategory: 'UNAVAILABLE',
            errorMessage: 'Upstream unhealthy',
          })
          lastError = new UpstreamUnavailableError(route.upstreamId)
          continue
        }

        const apiKey = await getProviderApiKey(route.upstreamId as UpstreamId, params.orgId)
        if (!apiKey) {
          logger.warn({ upstream: route.upstreamId, model: params.model }, 'No credential configured for upstream')
          attempts.push({
            attemptNumber,
            upstream: route.upstreamId,
            upstreamModelId: route.upstreamModelId,
            routePriority: route.priority,
            success: false,
            errorCategory: 'CONFIGURATION',
            errorMessage: 'No credential configured',
          })
          lastError = new Error(`No credential configured for upstream '${route.upstreamId}'`)
          continue
        }

        const response = await this.route({
          upstream: route.upstreamId as UpstreamId,
          upstreamModelId: route.upstreamModelId,
          apiKey,
          messages: params.messages,
          system: params.system,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: params.stream,
        })

        attempts.push({
          attemptNumber,
          upstream: route.upstreamId,
          upstreamModelId: route.upstreamModelId,
          routePriority: route.priority,
          success: true,
        })

        const fallbackUsed = attempts.length > 1
        const fallbackUpstream = fallbackUsed ? route.upstreamId : undefined

        return {
          response,
          finalRoute: {
            upstreamId: route.upstreamId,
            upstreamModelId: route.upstreamModelId,
            priority: route.priority,
          },
          attempts,
          fallbackUsed,
          fallbackUpstream,
        }
      } catch (err: any) {
        lastError = err
        const errorCategory = normalizeErrorCategory(err)
        attempts.push({
          attemptNumber,
          upstream: route.upstreamId,
          upstreamModelId: route.upstreamModelId,
          routePriority: route.priority,
          success: false,
          errorCategory,
          errorMessage: err.message,
        })

        const isRetryable = this.isRetryableError(err)
        if (isRetryable && i < candidates.length - 1) {
          logger.info({ upstream: route.upstreamId, model: params.model, error: err.message }, 'Retryable upstream error; attempting fallback route')
          continue
        }
        break
      }
    }

    if (lastError) {
      (lastError as any).routeAttempts = attempts
      throw lastError
    }
    const err = new UnsupportedModelError(params.model)
    ;(err as any).routeAttempts = attempts
    throw err
  }

  private isRetryableError(err: any): boolean {
    if (err instanceof UpstreamUnavailableError) return true
    if (err.name === 'ProviderRequestError' && err.retryable) return true
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true
    if (err.status >= 500 && err.status < 600) return true
    if (err.status === 401 || err.status === 403 || err.status === 400 || err.status === 402 || err.status === 429) return false
    return false
  }

  resolveUpstream(model: string): { upstreamId: UpstreamId; upstreamModelId: string } {
    const candidates = this.resolveRouteCandidates(model)
    if (candidates.length > 0) {
      const best = candidates[0]!
      return {
        upstreamId: best.upstreamId as UpstreamId,
        upstreamModelId: best.upstreamModelId,
      }
    }
    throw new UnsupportedModelError(model)
  }

  private resolveRouteCandidates(model: string): RouteCandidate[] {
    const explicitRoutes = getRoutesForModel(model)
    if (explicitRoutes.length > 0) {
      return explicitRoutes
        .sort((a, b) => a.priority - b.priority)
        .map(r => ({
          upstreamId: r.upstreamId,
          upstreamModelId: r.upstreamModelId,
          priority: r.priority,
          isDynamic: false,
        }))
    }

    if (!modelCatalogService.isSupported(model)) {
      return []
    }

    const dynamicRoute = this.deriveDynamicRoute(model)
    if (dynamicRoute) {
      return [dynamicRoute]
    }

    return []
  }

  private deriveDynamicRoute(model: string): RouteCandidate | null {
    if (!model || typeof model !== 'string') return null
    if (!model.includes('/')) return null

    if (openRouterAdapter.supports(model)) {
      return {
        upstreamId: 'openrouter',
        upstreamModelId: model,
        priority: 1,
        isDynamic: true,
      }
    }

    return null
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
    await valkey.setex(key, 300, 'unhealthy')
    logger.error({ upstream }, 'Upstream marked unhealthy')
  }
}

export const providerRouter = new ProviderRouterService()
