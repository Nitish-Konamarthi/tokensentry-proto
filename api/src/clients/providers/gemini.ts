import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export async function callGemini(params: {
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
}): Promise<Response> {
  const contents = params.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }],
  }))

  const url = `${BASE_URL}/models/${params.model}:${params.stream ? 'streamGenerateContent' : 'generateContent'}?key=${params.apiKey}`

  return fetchWithTimeoutAndRetry({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: params.system ? { parts: [{ text: params.system }] } : undefined,
      generationConfig: {
        maxOutputTokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 1,
      },
    }),
  }, 'gemini')
}

export function parseGeminiResponse(response: any): {
  content: string
  inputTokens: number
  outputTokens: number
} {
  const candidate = response.candidates?.[0]
  const content = candidate?.content?.parts
    ?.map((p: any) => p.text)
    ?.join('') ?? ''

  const metadata = response.usageMetadata ?? {}
  return {
    content,
    inputTokens: metadata.promptTokenCount ?? 0,
    outputTokens: metadata.candidatesTokenCount ?? 0,
  }
}
