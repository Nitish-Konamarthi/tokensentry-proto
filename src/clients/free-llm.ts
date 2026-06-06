// src/clients/free-llm.ts
// Free model routing stack for TokenSentry governance meta-calls
// Priority: Groq (free 14,400 req/day) → Gemini Flash (free 1M tok/day)
//           → Cloudflare Workers AI (free) → Anthropic Haiku (paid, last resort)
//
// This replaces direct Anthropic usage for ALL governance calls (classifier,
// optimizer, guard, etc.) — cutting meta-call costs from ~$170/month to ~$0.

import { config } from '../utils/config.js'
import { logger } from '../utils/logger.js'
import type { TSMode } from '../prompts.js'

interface CompletionResponse {
  content: string
  model_used: string
  tokens: number
}

// ── Model assignments per pillar ─────────────────────────────────────────────
// Each pillar gets 3 providers in priority order (free → paid fallback)
export const PILLAR_MODELS: Record<TSMode, readonly string[]> = {
  task_classifier: [
    'groq/llama-3.1-8b-instant',                           // PRIMARY: free, ~50ms
    'cloudflare/@cf/meta/llama-3.1-8b-instruct',           // FALLBACK: free, edge
    'claude-haiku-4-5',                                     // LAST RESORT: paid
  ],
  prompt_optimizer: [
    'groq/llama-3.3-70b-versatile',                        // PRIMARY: better language
    'gemini/gemini-1.5-flash',                             // FALLBACK: 1M context window
    'claude-haiku-4-5',                                    // LAST RESORT
  ],
  agentic_guard: [
    'groq/llama-3.1-8b-instant',                           // PRIMARY: fastest
    'groq/llama-3.3-70b-versatile',                        // FALLBACK: better decisions
    'claude-haiku-4-5',                                    // LAST RESORT
  ],
  waste_analyzer: [
    'groq/llama-3.3-70b-versatile',                        // PRIMARY: better reasoning
    'gemini/gemini-1.5-pro',                               // FALLBACK: free 2RPM
    'claude-sonnet-4-6',                                   // LAST RESORT: paid
  ],
  budget_advisor: [
    'groq/llama-3.3-70b-versatile',                        // PRIMARY: good prose
    'gemini/gemini-1.5-flash',                             // FALLBACK
    'claude-sonnet-4-6',                                   // LAST RESORT
  ],
  anomaly_detector: [
    'groq/llama-3.1-8b-instant',                           // PRIMARY: fast JSON
    'cloudflare/@cf/meta/llama-3.1-8b-instruct',           // FALLBACK: free
    'claude-haiku-4-5',                                    // LAST RESORT
  ],
  cost_forecaster: [
    'gemini/gemini-1.5-flash',                             // PRIMARY: good at math
    'groq/llama-3.3-70b-versatile',                        // FALLBACK
    'claude-sonnet-4-6',                                   // LAST RESORT
  ],
} as const

// Max output tokens per pillar (tune to control cost + latency)
const MAX_TOKENS: Record<TSMode, number> = {
  task_classifier:  256,
  prompt_optimizer: 4096,
  agentic_guard:    512,
  anomaly_detector: 512,
  waste_analyzer:   3000,
  budget_advisor:   1000,
  cost_forecaster:  1500,
}

// ── Provider implementations ─────────────────────────────────────────────────

async function callGroq(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<CompletionResponse> {
  if (!config.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured')

  const modelName = model.replace('groq/', '')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0,                               // Deterministic JSON output
      response_format: { type: 'json_object' },     // Force JSON mode
    }),
    signal: AbortSignal.timeout(15_000),            // 15s timeout
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json() as any
  return {
    content: data.choices[0].message.content as string,
    model_used: model,
    tokens: (data.usage?.total_tokens as number) ?? 0,
  }
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<CompletionResponse> {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const modelName = model.replace('gemini/', '')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0,
          responseMimeType: 'application/json',     // Force JSON output
        },
      }),
      signal: AbortSignal.timeout(20_000),          // 20s timeout
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json() as any
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    model_used: model,
    tokens: (data.usageMetadata?.totalTokenCount as number) ?? 0,
  }
}

async function callCloudflare(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<CompletionResponse> {
  if (!config.CLOUDFLARE_ACCOUNT_ID || !config.CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not configured')
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  if (!res.ok) throw new Error(`Cloudflare AI error: ${res.status}`)
  const data = await res.json() as any

  return {
    content: (data.result?.response as string) ?? '',
    model_used: 'cloudflare/llama-3.1-8b',
    tokens: 0, // Cloudflare doesn't report token count on this endpoint
  }
}

async function callAnthropicHaiku(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<CompletionResponse> {
  // LAST RESORT — only reached when all free tiers fail
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured (last resort fallback failed)')
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 1 })

  const res = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    content: (res.content[0] as any).text as string,
    model_used: 'claude-haiku-4-5',
    tokens: res.usage.input_tokens + res.usage.output_tokens,
  }
}

// ── JSON parser with safety guard ────────────────────────────────────────────
function parseJsonSafe<T>(raw: string, model: string): T {
  // Strip markdown code fences that some models add despite being asked not to
  const clean = raw
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  if (clean.length === 0) throw new Error(`Empty response from ${model}`)
  if (clean.length > 200_000) throw new Error(`Response too large from ${model} (${clean.length} chars)`)

  return JSON.parse(clean) as T
}

// ── Meta-cost tracking ────────────────────────────────────────────────────────
async function trackMetaCost(pillar: string, model: string, tokens: number): Promise<void> {
  const isPaid = model.startsWith('claude-')
  if (!isPaid || tokens === 0) return

  try {
    const { redis } = await import('./redis.js')
    const key = `meta:cost:${new Date().toISOString().slice(0, 7)}`  // YYYY-MM
    // Haiku: $0.80/M input + $4.00/M output ≈ $0.0000008/token avg
    await redis.incrbyfloat(key, tokens * 0.0000008)
    await redis.expire(key, 90 * 24 * 3600) // Keep 90 days
  } catch {
    // Non-critical — never block on tracking failure
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
// Tries providers in priority order. Parses JSON from each.
// Falls back to next provider on any error (rate limit, timeout, parse failure).
export async function callPillarAI<T>(
  pillar: TSMode,
  systemPrompt: string,
  payload: Record<string, unknown>
): Promise<T> {
  const models = PILLAR_MODELS[pillar]
  const userMessage = JSON.stringify({ mode: pillar, ...payload })
  const maxTokens = MAX_TOKENS[pillar]
  const errors: string[] = []

  for (const model of models) {
    try {
      let result: CompletionResponse

      if (model.startsWith('groq/')) {
        result = await callGroq(model, systemPrompt, userMessage, maxTokens)
      } else if (model.startsWith('gemini/')) {
        result = await callGemini(model, systemPrompt, userMessage, maxTokens)
      } else if (model.startsWith('cloudflare/')) {
        result = await callCloudflare(systemPrompt, userMessage, maxTokens)
      } else {
        // Anthropic (last resort)
        result = await callAnthropicHaiku(systemPrompt, userMessage, maxTokens)
      }

      const parsed = parseJsonSafe<T>(result.content, model)

      // Track meta-cost in background (non-blocking)
      void trackMetaCost(pillar, model, result.tokens)

      logger.debug({ pillar, model, tokens: result.tokens }, 'Pillar AI call succeeded')
      return parsed

    } catch (err) {
      const msg = (err as Error).message
      errors.push(`${model}: ${msg}`)
      logger.warn({ pillar, model, err: msg }, 'Pillar AI provider failed — trying next')
      // Continue to next provider
    }
  }

  throw new Error(
    `All providers failed for pillar '${pillar}'. Errors:\n${errors.map(e => `  - ${e}`).join('\n')}`
  )
}
