import { Type } from '@sinclair/typebox'

export const proxyRequestBodySchema = Type.Object({
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

export const proxyResponseSchema = Type.Object({
  id: Type.String(),
  model: Type.String(),
  choices: Type.Array(Type.Object({
    index: Type.Integer(),
    message: Type.Object({
      role: Type.String(),
      content: Type.String(),
    }),
    finish_reason: Type.String(),
  })),
  usage: Type.Object({
    prompt_tokens: Type.Integer(),
    completion_tokens: Type.Integer(),
    total_tokens: Type.Integer(),
  }),
})

export const healthResponseSchema = Type.Object({
  status: Type.String(),
  uptime: Type.Number(),
  timestamp: Type.String(),
})
