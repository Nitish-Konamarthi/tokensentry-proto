import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.openai.com/v1'

export const OPENAI_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o':           { input: 2.50, output: 10.00 },
  'gpt-4o-mini':      { input: 0.15, output: 0.60 },
  'gpt-4.1':          { input: 2.00, output: 8.00 },
  'gpt-4.1-mini':     { input: 0.40, output: 1.60 },
  'o3':               { input: 10.00, output: 40.00 },
  'o4-mini':          { input: 1.10, output: 4.40 },
}

export async function callOpenAI(params: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}): Promise<Response> {
  const messages = params.system
    ? [{ role: 'system', content: params.system }, ...params.messages]
    : params.messages

  return fetchWithTimeoutAndRetry({
    url: `${BASE_URL}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 1,
      stream: params.stream ?? false,
    }),
  }, 'openai')
}

export function calculateOpenAICost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = OPENAI_COSTS[model]
  if (!costs) return 0
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
}

export function parseOpenAIResponse(response: any): {
  content: string
  inputTokens: number
  outputTokens: number
} {
  return {
    content: response.choices?.[0]?.message?.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  }
}
