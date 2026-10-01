import crypto from 'crypto'
import type { ProxyRequest } from '../../types/index.js'

export type PromptType = 'chat' | 'code' | 'image' | 'file' | 'unknown'
export type PromptComplexity = 'low' | 'medium' | 'high'

export interface NormalizedProxyRequest {
  model: string
  system: string
  messages: ProxyRequest['messages']
  maxTokens: number | null
  temperature: number | null
}

export interface PromptAnalysis {
  promptType: PromptType
  complexity: PromptComplexity
  tokenCount: number
  containsCode: boolean
  containsImagesOrFiles: boolean
  conversationLength: number
  recommendOptimization: boolean
  normalized: NormalizedProxyRequest
}

const CODE_DETECTION = /```[\s\S]*?```|`[^`]+`|\b(function|const|let|var|class|def|import|export|console\.log|print|println|return)\b/i
const IMAGE_FILE_DETECTION = /!\[.*?\]\(.*?\)|<img\s+[^>]*src=|\b(image|screenshot|pdf|jpg|jpeg|png|gif|attachment|upload|uploaded|file)\b/i
const DUPLICATE_MESSAGE_RATIO_THRESHOLD = 0.15

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

export function detectCode(messages: ProxyRequest['messages']): boolean {
  return messages.some(message => CODE_DETECTION.test(message.content))
}

export function detectImagesOrFiles(messages: ProxyRequest['messages']): boolean {
  return messages.some(message => IMAGE_FILE_DETECTION.test(message.content))
}

export function detectConversationLength(messages: ProxyRequest['messages']): number {
  return messages.length
}

export function estimateComplexity(tokenCount: number, conversationLength: number): PromptComplexity {
  if (tokenCount > 1200 || conversationLength > 10) return 'high'
  if (tokenCount > 600 || conversationLength > 5) return 'medium'
  return 'low'
}

export function shouldOptimizePrompt(
  originalMessages: ProxyRequest['messages'],
  normalizedMessages: ProxyRequest['messages'],
  tokenCount: number,
  complexity: PromptComplexity,
): boolean {
  const savings = estimatePromptSavings(originalMessages, normalizedMessages)
  const savingsRatio = tokenCount > 0 ? savings / tokenCount : 0
  const hasRepeats = savings > 0

  return (
    hasRepeats
    || savingsRatio >= DUPLICATE_MESSAGE_RATIO_THRESHOLD
    || complexity === 'high'
    || tokenCount > 1000
  )
}

export function analyzePrompt(payload: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  maxTokens?: number | null
  temperature?: number | null
  stream: boolean
}): PromptAnalysis {
  const normalized = normalizeRequestPayload(payload)
  const tokenCount = estimateTokenCount(payload.messages)
  const conversationLength = detectConversationLength(normalized.messages)
  const containsCode = detectCode(normalized.messages)
  const containsImagesOrFiles = detectImagesOrFiles(normalized.messages)
  const complexity = estimateComplexity(tokenCount, conversationLength)
  const promptType = containsImagesOrFiles
    ? 'image'
    : containsCode
      ? 'code'
      : conversationLength > 1
        ? 'chat'
        : 'chat'
  const recommendOptimization = shouldOptimizePrompt(payload.messages, normalized.messages, tokenCount, complexity)

  return {
    promptType,
    complexity,
    tokenCount,
    containsCode,
    containsImagesOrFiles,
    conversationLength,
    recommendOptimization,
    normalized,
  }
}
