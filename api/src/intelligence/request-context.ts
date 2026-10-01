import type { AuthContext, ProxyRequest } from '../types/index.js'
import type { NormalizedProxyRequest } from './analyzer/index.js'
import type { ProviderScore } from '../services/provider-scoring.js'

export interface ProviderHealthState {
  readonly provider: string
  readonly healthy: boolean
  readonly lastCheckedAt: number
}

export interface BudgetState {
  readonly approved: boolean
  readonly reason: string
  readonly currentSpendUsd: number
  readonly limitUsd: number
  readonly utilization: number
  readonly fallbackModel?: string
}

export interface PromptMetadata {
  readonly optimized: boolean
  readonly optimizerReason: string
  readonly estimatedSavingsTokens: number
}

export interface RoutingDecision {
  readonly requestedModel: string
  readonly approvedModel: string
  readonly overridden: boolean
  readonly estimatedCostUsd: number
  readonly provider: string
  readonly providerScores?: ProviderScore[]
}

export interface AnalyticsMetadata {
  readonly cacheHit: boolean
  readonly streamed: boolean
  readonly statusCode: number
  readonly costMicros: number
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface RequestTimestamps {
  readonly receivedAt: number
  readonly cacheResolvedAt?: number
  readonly budgetCheckedAt?: number
  readonly providerResponseAt?: number
  readonly decisionCompletedAt?: number
}

export interface RequestContext {
  readonly requestId: string
  readonly apiKey: string
  readonly organization: {
    readonly id: string
  }
  readonly team: {
    readonly id: string
  }
  readonly user: {
    readonly id: string
    readonly role: AuthContext['role']
  }
  readonly agent?: {
    readonly agentId?: string
    readonly sessionId?: string
    readonly blocked?: boolean
  }
  readonly request: {
    readonly payload: ProxyRequest
    readonly normalized?: NormalizedProxyRequest
    readonly hash?: string
    readonly optimizedMessages?: ProxyRequest['messages']
  }
  readonly providerHealth?: ProviderHealthState
  readonly budgetState?: BudgetState
  readonly promptMetadata?: PromptMetadata
  readonly routingDecision?: RoutingDecision
  readonly analyticsMetadata?: AnalyticsMetadata
  readonly timestamps: RequestTimestamps
}

export function createRequestContext(params: {
  requestId: string
  apiKey: string
  organizationId: string
  teamId: string
  userId: string
  userRole: AuthContext['role']
  body: ProxyRequest
  receivedAt: number
  agentId?: string
  sessionId?: string
}): RequestContext {
  return {
    requestId: params.requestId,
    apiKey: params.apiKey,
    organization: { id: params.organizationId },
    team: { id: params.teamId },
    user: { id: params.userId, role: params.userRole },
    agent: {
      agentId: params.agentId,
      sessionId: params.sessionId,
    },
    request: {
      payload: params.body,
    },
    timestamps: {
      receivedAt: params.receivedAt,
    },
  }
}
