export type NormalizedErrorCategory =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UNAVAILABLE'
  | 'SERVER_ERROR'
  | 'AUTH'
  | 'BAD_REQUEST'
  | 'RATE_LIMIT'
  | 'POLICY'
  | 'BUDGET'
  | 'AGENT_GUARD'
  | 'UNSUPPORTED_MODEL'
  | 'CONFIGURATION'

const PROVIDER_ERROR_MAP: Record<string, NormalizedErrorCategory> = {
  PROVIDER_AUTH: 'AUTH',
  PROVIDER_RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER_BAD_REQUEST: 'BAD_REQUEST',
  PROVIDER_UNAVAILABLE: 'SERVER_ERROR',
  PROVIDER_TIMEOUT: 'TIMEOUT',
  PROVIDER_NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'SERVER_ERROR',
}

export function normalizeErrorCategory(err: unknown): NormalizedErrorCategory {
  if (err instanceof Error) {
    if (err.name === 'UnsupportedModelError') return 'UNSUPPORTED_MODEL'
    if (err.name === 'UpstreamUnavailableError') return 'UNAVAILABLE'
  }

  const code = (err as { code?: string })?.code
  if (code && code in PROVIDER_ERROR_MAP) {
    return PROVIDER_ERROR_MAP[code]!
  }

  const status = (err as { status?: number })?.status
  if (status !== undefined) {
    if (status === 401 || status === 403) return 'AUTH'
    if (status === 429) return 'RATE_LIMIT'
    if (status === 400 || status === 422) return 'BAD_REQUEST'
    if (status >= 500) return 'SERVER_ERROR'
  }

  const message = (err as Error)?.message?.toLowerCase() ?? ''
  if (message.includes('timeout') || message.includes('abort')) return 'TIMEOUT'
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK'
  if (message.includes('config') || message.includes('credential')) return 'CONFIGURATION'

  return 'SERVER_ERROR'
}
