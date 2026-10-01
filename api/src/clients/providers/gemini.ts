import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { fetchWithTimeoutAndRetry } from '../../lib/provider-fetch.js'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export const GEMINI_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro':   { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
}

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

  const response = await fetchWithTimeoutAndRetry({
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

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error({ status: response.status, body }, 'Gemini API error')
    throw new Error(`Gemini API error: ${response.status} ${body}`)
  }

  return response
}

export function calculateGeminiCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = GEMINI_COSTS[model]
  if (!costs) return 0
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
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
