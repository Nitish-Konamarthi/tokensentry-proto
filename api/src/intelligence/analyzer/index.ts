import crypto from 'crypto'
import type { ProxyRequest } from '../../types/index.js'

export interface NormalizedProxyRequest {
  model: string
  system: string
  messages: ProxyRequest['messages']
  maxTokens: number | null
  temperature: number | null
}

export function normalizeMessages(messages: ProxyRequest['messages']): ProxyRequest['messages'] {
  const normalized: ProxyRequest['messages'] = []
  let lastMessage: ProxyRequest['messages'][number] | null = null
  for (const message of messages) {
    const content = message.content.trim().replace(/\s+/g, ' ')
    if (!content) continue
    const current: ProxyRequest['messages'][number] = { role: message.role, content }
    if (lastMessage && lastMessage.role === current.role && lastMessage.content === current.content) {
      continue
    }
    normalized.push(current)
    lastMessage = current
  }
  return normalized
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
