import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.anthropic.com/v1'

export const ANTHROPIC_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':     { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':    { input: 3.00, output: 15.00 },
  'claude-opus-4-6':      { input: 15.00, output: 75.00 },
}

export async function callAnthropic(params: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}): Promise<Response> {
  return fetchWithTimeoutAndRetry({
    url: `${BASE_URL}/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 1024,
      messages: params.messages.filter(m => m.role !== 'system'),
      system: params.system,
      temperature: params.temperature ?? 1,
      stream: params.stream ?? false,
    }),
  }, 'anthropic')
}

export function calculateAnthropicCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = ANTHROPIC_COSTS[model]
  if (!costs) return 0
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
}

export function parseAnthropicResponse(response: any): {
  content: string
  inputTokens: number
  outputTokens: number
} {
  const content = response.content
    ?.filter((b: any) => b.type === 'text')
    ?.map((b: any) => b.text)
    ?.join('') ?? ''

  return {
    content,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }
}
