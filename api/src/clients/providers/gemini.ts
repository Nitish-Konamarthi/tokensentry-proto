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
  const systemTexts = [params.system, ...params.messages.filter(m => m.role === 'system').map(m => m.content)]
    .filter((text): text is string => Boolean(text?.trim()))
  const contents = params.messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }],
  }))

  const endpoint = `${BASE_URL}/models/${encodeURIComponent(params.model)}:${params.stream ? 'streamGenerateContent' : 'generateContent'}`
  const url = params.stream ? `${endpoint}?alt=sse` : endpoint

  return fetchWithTimeoutAndRetry({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': params.apiKey },
    body: JSON.stringify({
      contents,
      systemInstruction: systemTexts.length > 0 ? { parts: systemTexts.map(text => ({ text })) } : undefined,
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
