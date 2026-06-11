// src/config.ts
// Validates ALL environment variables on startup.
// If any required var is missing, the server crashes immediately with a clear error.
// This prevents silent failures in production.

import { z } from 'zod'

const envSchema = z.object({
  // App
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        z.coerce.number().default(3000),
  LOG_LEVEL:   z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  FRONTEND_URL: z.string().default('http://localhost:3001'),

  // Database
  DATABASE_URL:          z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL:          z.string().optional(),
  SUPABASE_SERVICE_KEY:  z.string().optional(),

  // Cache
  REDIS_URL:      z.string().min(1, 'REDIS_URL is required'),
  REDIS_PASSWORD: z.string().optional(),

  // Analytics
  CLICKHOUSE_URL:  z.string().min(1, 'CLICKHOUSE_URL is required'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASS: z.string().min(1, 'CLICKHOUSE_PASS is required'),

  // AI — Meta-calls (free models first, Anthropic is optional fallback)
  GROQ_API_KEY:      z.string().optional(),
  GEMINI_API_KEY:    z.string().optional(),
  PIONEER_API_KEY:   z.string().optional(),
  TOGETHER_API_KEY:  z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(), // Fallback only
  VOYAGE_API_KEY:    z.string().optional(),  // Embeddings (Ollama is free alternative)

  // Auth
  AUTH0_DOMAIN:   z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 chars')
    .optional()
    .default('dev-pepper-change-in-production-32chars'),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Payments
  STRIPE_SECRET_KEY:      z.string().optional(),
  STRIPE_WEBHOOK_SECRET:  z.string().optional(),
  STRIPE_PRICE_BUSINESS:  z.string().optional(),

  // Observability
  SENTRY_DSN:                    z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT:   z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS:    z.string().optional(),

  // Integrations
  SLACK_WEBHOOK_ALERTS:   z.string().optional(),
  INTERCOM_ACCESS_TOKEN:  z.string().optional(),

  // Cloudflare (for Workers AI free tier)
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN:  z.string().optional(),

  // Feature flags
  ENABLE_SEMANTIC_CACHE:    z.string().transform(v => v === 'true').default('true'),
  ENABLE_AGENTIC_GUARD:     z.string().transform(v => v === 'true').default('true'),
  ENABLE_WASTE_ANALYSIS:    z.string().transform(v => v === 'true').default('true'),
  ENABLE_OPENAI_PROXY:      z.string().transform(v => v === 'true').default('true'),
  ENABLE_GEMINI_PROXY:      z.string().transform(v => v === 'true').default('true'),
  ENABLE_PIONEER_ROUTING:   z.string().transform(v => v === 'true').default('true'),
  SEMANTIC_CACHE_THRESHOLD: z.coerce.number().default(0.94),
  LOOP_DETECTION_THRESHOLD: z.coerce.number().default(0.60),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌ Invalid environment variables:')
  result.error.issues.forEach(issue => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  })
  process.exit(1)
}

export const config = result.data
export type Config = typeof config
