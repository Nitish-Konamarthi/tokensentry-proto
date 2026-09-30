export type PlanTier = 'free' | 'starter' | 'business' | 'enterprise'

export type OrgRole = 'owner' | 'admin' | 'member'

export type ExhaustionAction = 'block' | 'downgrade' | 'warn'

export type AlertEventType = 'budget_80' | 'budget_95' | 'agent_terminated' | 'weekly_report' | 'plan_upgraded'

export type AlertChannelType = 'email' | 'slack'

export type AgentStatus = 'active' | 'terminated' | 'completed'

export type AgentAction = 'continue' | 'compress_context' | 'summarize_and_restart' | 'terminate'

export type CallStatus = 'success' | 'blocked' | 'error' | 'cache_hit'

export type ModelProvider = 'anthropic' | 'openai' | 'gemini'

export interface MonthlyUsage {
  month: string
  total_calls: number
  total_tokens: number
  total_cost_micros: number
  total_saved_micros: number
}

export interface DailySpend {
  date: string
  spend_micros: number
  saved_micros: number
  calls: number
}

export interface OrgSummary {
  org_id: string
  org_name: string
  plan: PlanTier
  current_month_spend_micros: number
  budget_monthly_micros: number
  member_count: number
}
