import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.openai.com/v1'

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
