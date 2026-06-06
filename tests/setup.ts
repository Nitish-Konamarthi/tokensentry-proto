// tests/setup.ts — Global test setup
// Runs before every test file — sets up env vars and mocks

import { vi } from 'vitest'

// Set required environment variables for tests
process.env['DATABASE_URL']     = process.env['DATABASE_URL']     ?? 'postgresql://postgres:test@localhost:5432/tokensentry_test'
process.env['REDIS_URL']        = process.env['REDIS_URL']        ?? 'redis://localhost:6379'
process.env['CLICKHOUSE_URL']   = process.env['CLICKHOUSE_URL']   ?? 'http://localhost:8123'
process.env['CLICKHOUSE_PASS']  = process.env['CLICKHOUSE_PASS']  ?? 'test'
process.env['ANTHROPIC_API_KEY']= process.env['ANTHROPIC_API_KEY']?? 'sk-ant-test-key-for-unit-tests'
process.env['AUTH0_DOMAIN']     = process.env['AUTH0_DOMAIN']     ?? 'test.auth0.com'
process.env['AUTH0_AUDIENCE']   = process.env['AUTH0_AUDIENCE']   ?? 'https://api.tokensentry.ai'
process.env['VOYAGE_API_KEY']   = process.env['VOYAGE_API_KEY']   ?? 'test-voyage-key'
process.env['NODE_ENV']         = 'test'

// Mock OTel instrumentation to avoid startup noise in tests
vi.mock('../src/instrumentation.js', () => ({}))

// Suppress logger output during tests (set LOG_LEVEL=debug to see logs)
if (!process.env['LOG_LEVEL']) {
  process.env['LOG_LEVEL'] = 'silent'
}
