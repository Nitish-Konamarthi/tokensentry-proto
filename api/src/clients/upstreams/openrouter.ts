import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry, ProviderRequestError } from '../../lib/provider-fetch.js'
import type { NormalizedRequest, UpstreamAdapter, UpstreamHealth } from '../../services/upstream-adapter.js'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

export class OpenRouterUpstreamAdapter implements UpstreamAdapter {
  id = 'openrouter'

  private getBaseUrl(): string {
    return env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL
  }

  private getApiKey(): string | undefined {
    return env.OPENROUTER_API_KEY || undefined
  }

  chat(request: NormalizedRequest): Promise<Response> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw new ProviderRequestError('PROVIDER_AUTH', 'OpenRouter API key not configured', 'openrouter', 401, false)
    }

    const messages = request.system
      ? [{ role: 'system', content: request.system }, ...request.messages]
      : request.messages

    const url = `${this.getBaseUrl()}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }

    // Optional OpenRouter metadata headers — only included when configured
    if (env.OPENROUTER_HTTP_REFERER) {
      headers['HTTP-Referer'] = env.OPENROUTER_HTTP_REFERER
    }
    if (env.OPENROUTER_X_TITLE) {
      headers['X-Title'] = env.OPENROUTER_X_TITLE
    }

    return fetchWithTimeoutAndRetry({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        messages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 1,
        stream: request.stream ?? false,
      }),
    }, 'openrouter')
  }

  async health(): Promise<UpstreamHealth> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      return {
        healthy: false,
        upstreamId: this.id,
        message: 'OpenRouter API key not configured',
        lastCheckedAt: Date.now(),
      }
    }

    try {
      const response = await fetchWithTimeoutAndRetry({
        url: `${this.getBaseUrl()}/models`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }, 'openrouter')

      const healthy = response.ok
      return {
        healthy,
        upstreamId: this.id,
        message: healthy ? 'OpenRouter is healthy' : `OpenRouter health check failed: ${response.status}`,
        lastCheckedAt: Date.now(),
      }
    } catch (err: any) {
      return {
        healthy: false,
        upstreamId: this.id,
        message: `OpenRouter health check error: ${err.message ?? String(err)}`,
        lastCheckedAt: Date.now(),
      }
    }
  }

  supports(model: string): boolean {
    // OpenRouter supports a broad set of models including those with slashes.
    // For V1, we treat any non-empty model identifier as potentially supported,
    // but require that it includes a provider prefix (e.g., anthropic/claude-sonnet-4-6)
    // or is a known OpenRouter identifier.
    if (!model || typeof model !== 'string') return false

    // Support model IDs with slashes (common OpenRouter format)
    if (model.includes('/')) return true

    // Support known OpenRouter-style model names
    const knownPrefixes = ['anthropic/', 'openai/', 'google/', 'groq/', 'mistral/', 'meta/', 'qwen/']
    for (const prefix of knownPrefixes) {
      if (model.startsWith(prefix)) return true
    }

    return false
  }
}

export const openRouterAdapter = new OpenRouterUpstreamAdapter()
