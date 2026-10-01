import { logger } from './logger.js'

export interface FetchOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxRetries?: number
}

export interface ProviderError {
  status: number
  message: string
  retryable: boolean
  provider: string
}

const NON_RETRYABLE_STATUSES = new Set([
  400, 401, 403, 404, 405, 422, 429,
])

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

        const errorMsg = `Provider ${providerName} error: ${response.status}`
        logger.error({ provider: providerName, status: response.status, body: bodyText.slice(0, 200) }, errorMsg)
        throw new Error(errorMsg)
      }

      return response
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId)
      lastError = err

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

  const status = (lastError as any)?.status ?? 502
  throw new Error(`Provider ${providerName} failed after ${maxRetries} retries: ${(lastError as Error)?.message ?? 'Unknown error'}`)
}
