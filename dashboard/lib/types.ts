export interface RealtimeMetrics {
  today_usd: number
  this_month_usd: number
  monthly_limit_usd: number
  utilization: number
  budget_remaining_usd: number
  status: 'healthy' | 'warning' | 'critical'
}

export interface DailyRow {
  date: string
  spend_usd: number
  saved_usd: number
  calls: number
}

export interface ModelRow {
  model: string
  calls: number
  cost_usd: number
  pct: number
}

export interface BudgetPolicy {
  id: string
  monthly_limit_usd: number
  daily_limit_usd: number | null
  alert_at_80: boolean
  alert_at_95: boolean
  on_exhaustion: string
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked: boolean
  expires_at: string | null
}

export interface TeamMember {
  id: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  last_active: string | null
}

export interface AuditLogEntry {
  id: string
  actor_id: string | null
  action: string
  resource: string
  details: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface ProviderHealth {
  provider: string
  status: 'healthy' | 'degraded' | 'down'
  last_checked_at: string
  avg_latency_ms: number | null
  error_count: number
}

export interface AgentSession {
  id: string
  agent_id: string
  status: 'active' | 'completed' | 'terminated'
  turn_count: number
  tokens_consumed: number
  token_budget: number
  loop_detected: boolean
  started_at: string
  terminated_at: string | null
}

export interface OrgSettings {
  name: string
  slug: string
  plan: string
  model_policy: {
    allowed_models: string[]
    max_model_tier: string
    require_classification: boolean
  }
}
