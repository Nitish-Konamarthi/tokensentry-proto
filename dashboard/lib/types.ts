export interface DailyRow {
  date: string
  spend_usd: number
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

export interface AgentSession {
  id: string
  agentId: string
  status: string
  turnCount: number
  tokensConsumed: number
  tokenBudget: number
  loopDetected: boolean
  riskScore: number
  startedAt: string
  terminatedAt: string | null
}

export interface OrgSettings {
  name: string
  slug: string
  plan: string
  model_policy: {
    allowed_models: string[]
    max_model_tier: string
  }
}
