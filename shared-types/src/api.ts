import { Type, type Static } from '@sinclair/typebox'

export const ProxyRequestSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  messages: Type.Array(Type.Object({
    role: Type.Union([Type.Literal('user'), Type.Literal('assistant'), Type.Literal('system')]),
    content: Type.String({ minLength: 1 }),
  }), { minItems: 1 }),
  system: Type.Optional(Type.String()),
  stream: Type.Optional(Type.Boolean()),
  max_tokens: Type.Optional(Type.Integer({ minimum: 1, maximum: 200_000 })),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
})
export type ProxyRequest = Static<typeof ProxyRequestSchema>

export const ProxyResponseSchema = Type.Object({
  id: Type.String(),
  model: Type.String(),
  choices: Type.Array(Type.Object({
    index: Type.Integer(),
    message: Type.Object({ role: Type.String(), content: Type.String() }),
    finish_reason: Type.String(),
  })),
  usage: Type.Object({
    prompt_tokens: Type.Integer(),
    completion_tokens: Type.Integer(),
    total_tokens: Type.Integer(),
  }),
  _ts: Type.Object({
    call_id: Type.String(),
    cost_usd: Type.Number(),
    saved_usd: Type.Number(),
  }),
})
export type ProxyResponse = Static<typeof ProxyResponseSchema>

export const BudgetPolicySchema = Type.Object({
  id: Type.String(),
  monthly_limit_usd: Type.Number(),
  daily_limit_usd: Type.Union([Type.Number(), Type.Null()]),
})
export type BudgetPolicy = Static<typeof BudgetPolicySchema>

export const BudgetResponseSchema = Type.Object({
  policy: Type.Union([BudgetPolicySchema, Type.Null()]),
  current: Type.Object({
    today_usd: Type.Number(),
    this_month_usd: Type.Number(),
    utilization_pct: Type.Number(),
  }),
})
export type BudgetResponse = Static<typeof BudgetResponseSchema>

export const SpendAnalyticsSchema = Type.Object({
  realtime: Type.Object({
    today_usd: Type.Number(),
    this_month_usd: Type.Number(),
  }),
  time_series: Type.Array(Type.Object({
    date: Type.String(),
    spend_usd: Type.Number(),
    calls: Type.Integer(),
  })),
})
export type SpendAnalytics = Static<typeof SpendAnalyticsSchema>

export const ModelDistributionSchema = Type.Array(Type.Object({
  model: Type.String(),
  calls: Type.Integer(),
  cost_usd: Type.Number(),
  pct: Type.Number(),
}))
export type ModelDistribution = Static<typeof ModelDistributionSchema>

export const ApiKeySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  prefix: Type.String(),
  scopes: Type.Array(Type.String()),
  created_at: Type.Optional(Type.String()),
  last_used_at: Type.Union([Type.String(), Type.Null()]),
  revoked: Type.Boolean(),
  expires_at: Type.Union([Type.String(), Type.Null()]),
})
export type ApiKey = Static<typeof ApiKeySchema>

export const CreateApiKeyResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  key: Type.String(),
  created_at: Type.Optional(Type.String()),
  expires_at: Type.Union([Type.String(), Type.Null()]),
})
export type CreateApiKeyResponse = Static<typeof CreateApiKeyResponseSchema>
