import type { ProviderHealthState } from './provider-router.js'

export interface NormalizedRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export interface NormalizedResponse {
  content: string
  inputTokens: number
  outputTokens: number
  rawResponse?: unknown
}

export interface UpstreamHealth {
  healthy: boolean
  upstreamId: string
  message?: string
  lastCheckedAt: number
}

export interface UpstreamAdapter {
  id: string
  chat(request: NormalizedRequest): Promise<Response>
  health(): Promise<UpstreamHealth>
  supports(model: string): boolean
}
