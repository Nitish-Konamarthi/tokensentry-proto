import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.groq.com/openai/v1'

export async function callGroq(params: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
}): Promise<Response> {
  const messages = params.system
    ? [{ role: 'system', content: params.system }, ...params.messages]
    : params.messages

  const response = await fetchWithTimeoutAndRetry({
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
    }),
  }, 'groq')

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error({ status: response.status, body }, 'Groq API error')
    throw new Error(`Groq API error: ${response.status} ${body}`)
  }

  return response
}
