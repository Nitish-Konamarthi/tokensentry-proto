import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://api.anthropic.com/v1'

export async function callAnthropic(params: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}): Promise<Response> {
  const system = [params.system, ...params.messages.filter(m => m.role === 'system').map(m => m.content)]
    .filter((text): text is string => Boolean(text?.trim()))
    .join('\n\n')
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
      system: system || undefined,
      temperature: params.temperature ?? 1,
      stream: params.stream ?? false,
    }),
  }, 'anthropic')
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
