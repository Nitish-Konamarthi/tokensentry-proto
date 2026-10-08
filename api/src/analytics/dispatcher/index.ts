import { PostgresAnalyticsDispatcher } from './postgres-dispatcher.js'
import type { RouteAttempt } from '../../services/provider-router.js'

export interface AnalyticsRequestMetadata {
  orgId: string
  teamId: string
  userId?: string
  apiKeyId?: string
}

export interface AnalyticsDispatchCall {
  requestMetadata: AnalyticsRequestMetadata
  model: string
  provider: string
  modelOwner?: string
  canonicalModel?: string
  upstream?: string
  upstreamModel?: string
  routePriority?: number
  attemptNumber?: number
  attempts?: RouteAttempt[]
  fallbackUsed?: boolean
  fallbackUpstream?: string
  success?: boolean
  normalizedErrorCategory?: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  costMicros: number
  cacheHit: boolean
  streamed: boolean
  statusCode: number
  error?: string
  usageEstimated?: boolean
  callId?: string
}

export interface AnalyticsDispatchRouting {
  orgId: string
  callId: string
  requestedModel: string
  canonicalModel?: string
  approvedModel: string
  modelOwner?: string
  upstream?: string
  upstreamModel?: string
  routePriority?: number
  attemptNumber?: number
  attempts?: RouteAttempt[]
  fallbackUsed?: boolean
  fallbackUpstream?: string
  success?: boolean
  normalizedErrorCategory?: string
  overridden?: boolean
  estimatedCostUsd?: number
  complexity?: string
  confidence?: number
  reasoning?: string
}

export interface AnalyticsDispatcher {
  recordCall(params: AnalyticsDispatchCall): Promise<string>
  recordRouting(params: AnalyticsDispatchRouting): Promise<void>
}

export const analyticsDispatcher: AnalyticsDispatcher = new PostgresAnalyticsDispatcher()
