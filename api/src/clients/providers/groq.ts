import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.groq.com/openai/v1'

export async function callGroq(params: {
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
      stream_options: params.stream ? { include_usage: true } : undefined,
    }),
  }, 'groq')
}
