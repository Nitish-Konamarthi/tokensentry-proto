// src/utils/config.ts
// Environment variable validation with Zod — crashes fast at startup
// if any required variable is missing or malformed.
// Import this FIRST in src/index.ts (after OTel instrumentation).

import { z } from 'zod'

const envSchema = z.object({
  // ── Server ─────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // ── Security ───────────────────────────────────────────────
  // Server-side pepper for HMAC API key hashing — NEVER rotate without migration
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 chars'),

  // ── Database ───────────────────────────────────────────────
  DATABASE_URL: z.string().url().startsWith('postgresql'),

  // ── Redis ──────────────────────────────────────────────────
  REDIS_URL: z.string().url().startsWith('redis'),

  // ── ClickHouse ─────────────────────────────────────────────
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_DB: z.string().default('tokensentry'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().default(''),

  // ── Auth0 (for JWT verification) ──────────────────────────
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),

  // ── Anthropic (platform key — fallback meta-calls only) ───
  // Optional: system can use free providers (Groq/Gemini) as primary
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

  // ── Free LLM providers (for meta-calls — zero cost) ───────
  GROQ_API_KEY: z.string().startsWith('gsk_').optional(),
  GEMINI_API_KEY: z.string().min(10).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),

  // ── Stripe ─────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  // ── Email ──────────────────────────────────────────────────
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  EMAIL_FROM: z.string().email().default('alerts@mail.tokensentry.ai'),

  // ── Trusted proxy CIDR list ────────────────────────────────
  // Comma-separated list of CIDR ranges that may set X-Forwarded-For
  // Example: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
  TRUSTED_PROXY_CIDRS: z.string().default('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32'),

  // ── Rate limiting ──────────────────────────────────────────
  RATE_LIMIT_PROXY_ORG: z.coerce.number().int().positive().default(500),   // req per 60s per org
  RATE_LIMIT_PROXY_IP: z.coerce.number().int().positive().default(100),    // req per 60s per IP

  // ── Feature flags ─────────────────────────────────────────
  ENABLE_SEMANTIC_CACHE: z.string().transform(v => v === 'true').default('true'),
  ENABLE_PROMPT_OPTIMIZER: z.string().transform(v => v === 'true').default('true'),
  MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(131072),     // 128K chars max
})

// Validate on module import — crashes the process immediately if invalid
const parseResult = envSchema.safeParse(process.env)

if (!parseResult.success) {
  console.error('\n❌ MISSING OR INVALID ENVIRONMENT VARIABLES:\n')
  for (const issue of parseResult.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\nCheck .env.example for the full list of required variables.\n')
  process.exit(1)
}

export const config = parseResult.data
export type Config = typeof config
