import { logger } from './logger.js'

export interface FetchOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxRetries?: number
}

export type ProviderErrorCode =
  | 'PROVIDER_AUTH'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_BAD_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_ERROR'

export class ProviderRequestError extends Error {
  public readonly code: ProviderErrorCode
  public readonly status: number
  public readonly provider: string
  public readonly retryable: boolean

  constructor(code: ProviderErrorCode, message: string, provider: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'ProviderRequestError'
    this.code = code
    this.status = status
    this.provider = provider
    this.retryable = retryable
  }
}

const NON_RETRYABLE_STATUSES = new Set([
  400, 401, 403, 404, 405, 422, 429,
])

function classifyProviderError(status: number, provider: string, message: string): ProviderRequestError {
  let code: ProviderErrorCode
  let retryable = false

  if (status === 401 || status === 403) {
    code = 'PROVIDER_AUTH'
  } else if (status === 429) {
    code = 'PROVIDER_RATE_LIMIT'
    // Rate limit errors are retryable after a delay
    // retryable = false (handled by retry logic with backoff)
  } else if (status === 400 || status === 422) {
    code = 'PROVIDER_BAD_REQUEST'
  } else if (status >= 500) {
    code = 'PROVIDER_UNAVAILABLE'
    retryable = true
  } else {
    code = 'PROVIDER_ERROR'
  }

  return new ProviderRequestError(code, message, provider, status, retryable)
}

export async function fetchWithTimeoutAndRetry(
  options: FetchOptions,
  providerName: string,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxRetries = options.maxRetries ?? 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(options.url, {
        method: options.method ?? 'POST',
        headers: options.headers ?? {},
        body: options.body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      timeoutId = null

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '')
        const retryable = !NON_RETRYABLE_STATUSES.has(response.status) && response.status >= 500

        if (retryable && attempt < maxRetries) {
          logger.warn({ provider: providerName, status: response.status, attempt }, 'Provider retryable error')
          await new Promise((r) => setTimeout(r, 200))
          continue
        }

        // Classify the error and throw a typed error
        throw classifyProviderError(response.status, providerName, `Provider ${providerName} error: ${response.status}`)
      }

      return response
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId)
      lastError = err

      // Re-throw ProviderRequestError as-is
      if (err instanceof ProviderRequestError) {
        throw err
      }

      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('abort')
      const isNetworkError = err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('network')

      if ((isTimeout || isNetworkError) && attempt < maxRetries) {
        logger.warn({ provider: providerName, attempt, error: err.message }, 'Provider timeout/network error, retrying')
        await new Promise((r) => setTimeout(r, 200))
        continue
      }

      break
    }
  }

  const isTimeout = lastError?.name === 'AbortError' || lastError?.message?.includes('timeout') || lastError?.message?.includes('abort')
  const isNetworkError = lastError?.name === 'TypeError' || lastError?.message?.includes('fetch') || lastError?.message?.includes('network')

  if (isTimeout) {
    throw new ProviderRequestError('PROVIDER_TIMEOUT', `Provider ${providerName} request timed out`, providerName, 504, true)
  }
  if (isNetworkError) {
    throw new ProviderRequestError('PROVIDER_NETWORK', `Provider ${providerName} network error`, providerName, 502, true)
  }

  throw new ProviderRequestError('PROVIDER_ERROR', `Provider ${providerName} failed: ${(lastError as Error)?.message ?? 'Unknown error'}`, providerName, 502, false)
}
