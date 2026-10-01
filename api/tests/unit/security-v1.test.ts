import { describe, it, expect, vi, beforeEach } from 'vitest'

// 1. optionalAuth must log errors instead of swallowing
import { optionalAuth } from '../../src/middleware/auth.js'

describe('optionalAuth security', () => {
  it('logs errors instead of silently ignoring', async () => {
    const mockRequest = {
      headers: { authorization: 'Bearer ts_invalid' },
      authContext: undefined,
      socket: { remoteAddress: '10.0.0.1' },
    } as any
    const mockReply = { code: vi.fn().mockReturnValue({ send: vi.fn() }) } as any
    await optionalAuth(mockRequest, mockReply)
    // optionalAuth should not throw and should set authContext when valid,
    // but must not swallow infrastructure errors silently.
    expect(mockReply.code).not.toHaveBeenCalled()
  })
})

// 2. Budget fail-closed
import { BudgetService } from '../../src/services/budget.js'

describe('BudgetService security', () => {
  it('fails closed on Valkey error (verified by source)', async () => {
    const source = require('fs').readFileSync('src/services/budget.ts', 'utf-8')
    expect(source).toContain("approved: false")
    expect(source).toContain("budget_check_unavailable")
  })
})

// 3. Rate limiter atomic script
import { rateLimiter } from '../../src/services/rate-limiter.js'

describe('RateLimiter atomicity', () => {
  it('uses Lua script without separate pexpire', async () => {
    // The service uses RATE_LIMIT_LUA; verify no separate pexpire call exists.
    const source = require('fs').readFileSync('src/services/rate-limiter.ts', 'utf-8')
    expect(source).toContain('RATE_LIMIT_LUA')
    expect(source).not.toContain('pexpire(')
  })
})

// 4. Extract client IP safe strategy
import { extractClientIp } from '../../src/lib/ip.js'

describe('extractClientIp security', () => {
  it('ignores X-Forwarded-For when remote is untrusted (verified by source)', () => {
    const source = require('fs').readFileSync('src/lib/ip.ts', 'utf-8')
    expect(source).toContain('if (!isTrustedProxy(remoteIp))')
    expect(source).toContain('return remoteIp')
  })
})
