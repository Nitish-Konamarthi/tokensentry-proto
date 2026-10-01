export interface AuthContext {
  orgId: string
  teamId: string
  userId: string
  keyId: string
  role: 'owner' | 'admin' | 'member'
  plan: 'starter' | 'business' | 'enterprise'
}

export interface ProviderCost {
  input: number
  output: number
}

export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'groq'

export interface ProxyRequest {
  model: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  system?: string
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

export interface ProxyResponse {
  id: string
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  _ts?: {
    call_id: string
    cost_usd: number
    saved_usd: number
    cache_hit: boolean
  }
}

export interface BudgetResult {
  approved: boolean
  reason: string
  current_spend_usd: number
  limit_usd: number
  utilization: number
  should_alert_80: boolean
  should_alert_95: boolean
  fallback_model?: string
}

export interface RateLimitConfig {
  window_ms: number
  max_requests: number
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext
  }
}
