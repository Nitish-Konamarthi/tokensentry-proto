import { Type, type Static } from '@sinclair/typebox'

// ——— Proxy ———

export const ProxyRequestSchema = Type.Object({
  model: Type.String(),
  messages: Type.Array(Type.Object({
    role: Type.Union([Type.Literal('user'), Type.Literal('assistant'), Type.Literal('system')]),
    content: Type.String()
  })),
  system: Type.Optional(Type.String()),
  stream: Type.Optional(Type.Boolean()),
  max_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
})

export type ProxyRequest = Static<typeof ProxyRequestSchema>

// ——— Spend ———

export const RealtimeSpendSchema = Type.Object({
  today_usd: Type.Number(),
  this_month_usd: Type.Number(),
  budget_monthly_usd: Type.Number(),
  utilization_pct: Type.Number(),
  status: Type.Union([Type.Literal('healthy'), Type.Literal('warning'), Type.Literal('critical'), Type.Literal('exceeded')]),
})

export type RealtimeSpend = Static<typeof RealtimeSpendSchema>

// ——— Budget ———

export const BudgetPolicySchema = Type.Object({
  id: Type.String(),
  monthly_limit_cents: Type.Integer(),
  daily_limit_cents: Type.Optional(Type.Integer()),
  exhaustion_action: Type.Union([Type.Literal('block'), Type.Literal('downgrade'), Type.Literal('warn')]),
  downgrade_to_haiku: Type.Boolean(),
  current_monthly_cents: Type.Integer(),
  current_daily_cents: Type.Integer(),
})

export type BudgetPolicy = Static<typeof BudgetPolicySchema>

// ——— Analytics ———

export const SpendTimeSeriesSchema = Type.Array(Type.Object({
  date: Type.String(),
  spend_usd: Type.Number(),
  saved_usd: Type.Number(),
}))

export const ModelDistributionSchema = Type.Array(Type.Object({
  model: Type.String(),
  calls: Type.Integer(),
  cost_usd: Type.Number(),
  pct: Type.Number(),
}))

export type ModelDistribution = Static<typeof ModelDistributionSchema>

// ——— API Key ———

export const ApiKeySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  prefix: Type.String(),
  created_at: Type.String(),
  last_used_at: Type.Optional(Type.String()),
  revoked: Type.Boolean(),
})

export type ApiKey = Static<typeof ApiKeySchema>

export const CreateApiKeyResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  key: Type.String(),
  created_at: Type.String(),
})

export type CreateApiKeyResponse = Static<typeof CreateApiKeyResponseSchema>

// ——— Advisor ———

export const AdvisorQuerySchema = Type.Object({
  query: Type.String(),
})

export const AdvisorResponseSchema = Type.Object({
  answer: Type.String(),
  context: Type.Optional(Type.Object({
    current_monthly_spend: Type.Number(),
    top_model: Type.Optional(Type.String()),
    budget_remaining: Type.Optional(Type.Number()),
  }))
})

export type AdvisorResponse = Static<typeof AdvisorResponseSchema>

// ——— Agent ———

export const AgentCheckResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('active'), Type.Literal('terminated'), Type.Literal('completed')]),
  action: Type.Optional(Type.Union([
    Type.Literal('continue'),
    Type.Literal('compress_context'),
    Type.Literal('summarize_and_restart'),
    Type.Literal('terminate'),
  ])),
  reason: Type.Optional(Type.String()),
})

export type AgentCheckResponse = Static<typeof AgentCheckResponseSchema>

// ——— Onboarding ———

export const OnboardingSetupResponseSchema = Type.Object({
  org_id: Type.String(),
  api_key: Type.String(),
  curl_example: Type.String(),
})

export type OnboardingSetupResponse = Static<typeof OnboardingSetupResponseSchema>
