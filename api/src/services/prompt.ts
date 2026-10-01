import crypto from 'crypto'
import { env } from '../config/env.js'
import type { ProxyRequest } from '../types/index.js'

export interface PromptOptimizerResult {
  optimized: boolean
  messages: ProxyRequest['messages']
  estimatedSavingsTokens: number
  reason: string
}

const MIN_SAVINGS_RATIO = 0.15
const CLEANUP_MAX_UNMODIFIED_TOKENS = 1000

export function normalizeMessages(messages: ProxyRequest['messages']): ProxyRequest['messages'] {
  const normalized: ProxyRequest['messages'] = []
  let lastMessage: ProxyRequest['messages'][number] | null = null

  for (const message of messages) {
    const content = message.content.trim().replace(/\s+/g, ' ')
    if (!content) continue

    const current: ProxyRequest['messages'][number] = {
      role: message.role,
      content,
    }

    if (lastMessage && lastMessage.role === current.role && lastMessage.content === current.content) {
      continue
    }

    normalized.push(current)
    lastMessage = current
  }

  return normalized
}

export interface NormalizedProxyRequest {
  model: string
  system: string
  messages: ProxyRequest['messages']
  maxTokens: number | null
  temperature: number | null
}

export function normalizeRequestPayload(payload: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  maxTokens?: number | null
  temperature?: number | null
}): NormalizedProxyRequest {
  return {
    model: payload.model,
    system: payload.system?.trim() ?? '',
    messages: normalizeMessages(payload.messages),
    maxTokens: payload.maxTokens ?? null,
    temperature: payload.temperature ?? null,
  }
}

export function computeRequestHash(payload: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  maxTokens?: number | null
  temperature?: number | null
}): string {
  const normalized = normalizeRequestPayload(payload)
  const json = JSON.stringify(normalized)
  return crypto.createHash('sha256').update(json).digest('hex')
}

export function estimateTokenCount(messages: ProxyRequest['messages']): number {
  return messages.reduce((sum, message) => {
    if (typeof message.content !== 'string') return sum
    return sum + Math.ceil(message.content.length / 4)
  }, 0)
}

export function estimatePromptSavings(originalMessages: ProxyRequest['messages'], cleanedMessages: ProxyRequest['messages']): number {
  return Math.max(0, estimateTokenCount(originalMessages) - estimateTokenCount(cleanedMessages))
}

export async function optimizePromptRequest(params: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  stream: boolean
  orgPolicy: Record<string, unknown>
}): Promise<PromptOptimizerResult> {
  const normalized = normalizeMessages(params.messages)
  const originalTokenCount = estimateTokenCount(params.messages)
  const cleanedTokenCount = estimateTokenCount(normalized)
  const savings = estimatePromptSavings(params.messages, normalized)
  const savingsRatio = originalTokenCount > 0 ? savings / originalTokenCount : 0

  if (!env.ENABLE_PROMPT_OPTIMIZER || params.stream) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: savings,
      reason: params.stream ? 'Streaming requests are not optimized' : 'Prompt optimizer disabled',
    }
  }

  if (savingsRatio < MIN_SAVINGS_RATIO && originalTokenCount < CLEANUP_MAX_UNMODIFIED_TOKENS) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: savings,
      reason: 'Insufficient token savings for optimization',
    }
  }

  const optimizedMessages = await optimizeWithLocalModel({
    model: params.model,
    system: params.system,
    messages: normalized,
    orgPolicy: params.orgPolicy,
  })

  const optimizedTokenCount = estimateTokenCount(optimizedMessages)
  const optimizedSavings = Math.max(0, originalTokenCount - optimizedTokenCount)
  const optimizedSavingsRatio = originalTokenCount > 0 ? optimizedSavings / originalTokenCount : 0

  if (optimizedSavingsRatio < MIN_SAVINGS_RATIO) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: optimizedSavings,
      reason: 'Local optimization did not produce material savings',
    }
  }

  return {
      optimized: true,
      messages: optimizedMessages,
      estimatedSavingsTokens: optimizedSavings,
      reason: 'Prompt optimizer applied',
  }
}

async function optimizeWithLocalModel(params: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  orgPolicy: Record<string, unknown>
}): Promise<ProxyRequest['messages']> {
  if (!env.PROMPT_OPTIMIZER_URL) {
    return ruleBasedPromptOptimization(params.messages)
  }

  try {
    const response = await fetch(env.PROMPT_OPTIMIZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: params.model, system: params.system, messages: params.messages, orgPolicy: params.orgPolicy }),
    })

    if (!response.ok) {
      return ruleBasedPromptOptimization(params.messages)
    }

    const data = await response.json() as { messages?: ProxyRequest['messages'] }
    if (!data.messages || !Array.isArray(data.messages)) {
      return ruleBasedPromptOptimization(params.messages)
    }

    return normalizeMessages(data.messages)
  } catch {
    return ruleBasedPromptOptimization(params.messages)
  }
}

function ruleBasedPromptOptimization(messages: ProxyRequest['messages']): ProxyRequest['messages'] {
  const collapsed: ProxyRequest['messages'] = []
  let lastUserContent = ''
  let lastSystem: string | null = null

  for (const message of messages) {
    if (message.role === 'system') {
      const content = message.content.trim().replace(/\s+/g, ' ')
      if (!content) continue
      if (lastSystem === content) continue
      collapsed.push({ role: 'system', content })
      lastSystem = content
      continue
    }

    if (message.role === 'user') {
      const content = message.content.trim().replace(/\s+/g, ' ')
      if (!content) continue
      if (content === lastUserContent) continue
      collapsed.push({ role: 'user', content })
      lastUserContent = content
      continue
    }

    collapsed.push({
      role: message.role,
      content: message.content.trim().replace(/\s+/g, ' '),
    })
  }

  return collapsed
}
