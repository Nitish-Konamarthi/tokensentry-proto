import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterUpstreamAdapter } from '../../src/clients/upstreams/openrouter.js'

vi.mock('../../src/config/env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter-test.example.com/api/v1',
    OPENROUTER_HTTP_REFERER: undefined,
    OPENROUTER_X_TITLE: undefined,
  },
}))

describe('OpenRouter Upstream Adapter', () => {
  const adapter = new OpenRouterUpstreamAdapter()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct id', () => {
    expect(adapter.id).toBe('openrouter')
  })

  it('supports models with slashes', () => {
    expect(adapter.supports('anthropic/claude-sonnet-4-6')).toBe(true)
    expect(adapter.supports('openai/gpt-4o')).toBe(true)
  })

  it('supports known prefixes', () => {
    expect(adapter.supports('mistral/some-model')).toBe(true)
    expect(adapter.supports('meta/llama-3')).toBe(true)
  })

  it('rejects empty model strings', () => {
    expect(adapter.supports('')).toBe(false)
    expect(adapter.supports('unknown-model-without-prefix')).toBe(false)
  })

  it('transforms request and captures response correctly', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Hello from OpenRouter' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    }
    global.fetch = vi.fn().mockResolvedValue(mockResponse as any)

    const result = await adapter.chat({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'Be helpful',
      maxTokens: 512,
      temperature: 0.5,
      stream: false,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const fetchCallUrl = (global.fetch as any).mock.calls[0][0]
    expect(typeof fetchCallUrl).toBe('string')
    expect(fetchCallUrl).toContain('openrouter-test')

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  })

  it('handles upstream errors', async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    }
    global.fetch = vi.fn().mockResolvedValue(mockResponse as any)

    await expect(adapter.chat({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow('Provider openrouter error')
  })

  it('handles timeout/network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))
    await expect(adapter.chat({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow('Provider openrouter failed')
  })
})
