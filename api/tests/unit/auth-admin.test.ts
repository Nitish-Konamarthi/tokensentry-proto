import { describe, it, expect, vi } from 'vitest'
import { requireAdmin } from '../../src/middleware/auth-admin.js'

describe('requireAdmin', () => {
  it('allows owner and admin roles', async () => {
    const req = { authContext: { role: 'admin' } } as any
    const reply = { code: vi.fn().mockReturnValue({ send: vi.fn() }) } as any
    await requireAdmin(req, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('blocks member role', async () => {
    const req = { authContext: { role: 'member' } } as any
    const reply = { code: vi.fn().mockReturnValue({ send: vi.fn() }) } as any
    await requireAdmin(req, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })
})
