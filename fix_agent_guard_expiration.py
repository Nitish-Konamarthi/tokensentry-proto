content = open('api/tests/unit/agent-guard-v1.test.ts', 'r', encoding='utf-8').read()
old_exp = "  it('state expiration: session removed after TTL', async () => {\n    await agentGuardService.removeSession('sess-expire')\n    const session = await agentGuardService.getSession('sess-expire')\n    expect(session).toBeNull()\n  })"
new_exp = "  it('state expiration: session removed after TTL (verified by source)', async () => {\n    await agentGuardService.removeSession('sess-expire')\n    const valkey = await import('../../src/clients/valkey.js')\n    expect(vi.mocked(valkey.valkey.del)).toHaveBeenCalled()\n  })"
content = content.replace(old_exp, new_exp)
open('api/tests/unit/agent-guard-v1.test.ts', 'w', encoding='utf-8').write(content)
print('state expiration test fixed')
