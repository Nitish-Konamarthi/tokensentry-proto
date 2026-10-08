import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Security
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 chars'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 chars').optional(),

  // Database
  DATABASE_URL: z.string().url(),

  // Valkey
  VALKEY_URL: z.string().url().default('redis://localhost:6379'),

  // Auth0
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),

  // AI Providers (optional — set at least one)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // OpenRouter upstream
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().optional(),
  OPENROUTER_HTTP_REFERER: z.string().optional(),
  OPENROUTER_X_TITLE: z.string().optional(),

  // Catalog sources (optional)
  MODELS_DEV_API_URL: z.string().url().optional(),
  OPENCODE_API_URL: z.string().url().optional(),

  // Feature flags (V1 keeps core functions only)
  MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(131072),

  // Rate limits
  RATE_LIMIT_PROXY_ORG: z.coerce.number().int().positive().default(500),

  // Agent Guard thresholds (V1 deterministic governance)
  AGENT_GUARD_MAX_RPS: z.coerce.number().positive().default(4),
  AGENT_GUARD_RETRY_RATIO: z.coerce.number().positive().default(0.5),
  AGENT_GUARD_TOOL_RATIO: z.coerce.number().positive().default(0.75),
  AGENT_GUARD_RECURSIVE_DEPTH_LIMIT: z.coerce.number().int().positive().default(2),
  AGENT_GUARD_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AGENT_GUARD_BLOCK_TTL_SECONDS: z.coerce.number().int().positive().default(120),

  // Trusted proxies
  TRUSTED_PROXY_CIDRS: z.string().default('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32'),
})

// In test environment, use defaults for required fields if not set
const testDefaults = process.env.NODE_ENV === 'test' ? {
  API_KEY_PEPPER: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  DATABASE_URL: 'postgresql://localhost:5432/tokensentry_test',
  VALKEY_URL: 'redis://localhost:6379/1',
  AUTH0_DOMAIN: 'test.tokensentry.ai',
  AUTH0_AUDIENCE: 'https://api.tokensentry.ai',
} : {}

const envToParse = { ...testDefaults, ...process.env }
const parsed = envSchema.safeParse(envToParse)

if (!parsed.success) {
  console.error('\nMissing or invalid environment variables:\n')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error()
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
