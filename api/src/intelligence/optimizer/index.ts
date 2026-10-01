import type { ProxyRequest } from '../../types/index.js'
import {
  normalizeMessages,
  estimateTokenCount,
  estimatePromptSavings,
} from '../analyzer/index.js'
import { optimizeWithSmolLocalModel } from './smol-local-optimizer.js'

export interface PromptOptimizerResult {
  optimized: boolean
  messages: ProxyRequest['messages']
  estimatedSavingsTokens: number
  reason: string
}

const MIN_SAVINGS_RATIO = 0.15
const CLEANUP_MAX_UNMODIFIED_TOKENS = 1000

export async function optimizePromptRequest(params: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  stream: boolean
  orgPolicy: Record<string, unknown>
  shouldOptimize: boolean
}): Promise<PromptOptimizerResult> {
  const normalized = normalizeMessages(params.messages)
  const originalTokenCount = estimateTokenCount(params.messages)
  const cleanedTokenCount = estimateTokenCount(normalized)
  const savings = estimatePromptSavings(params.messages, normalized)
  const savingsRatio = originalTokenCount > 0 ? savings / originalTokenCount : 0

  if (params.stream) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: savings,
      reason: 'Streaming requests are not optimized',
    }
  }

  if (!params.shouldOptimize) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: savings,
      reason: 'Prompt optimizer not requested',
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

  try {
    const optimizedMessages = await optimizeWithSmolLocalModel({
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
        reason: 'SmolLM optimization did not produce material savings',
      }
    }

    return {
      optimized: true,
      messages: optimizedMessages,
      estimatedSavingsTokens: optimizedSavings,
      reason: 'SmolLM prompt optimizer applied',
    }
  } catch (error) {
    return {
      optimized: false,
      messages: normalized,
      estimatedSavingsTokens: savings,
      reason: `SmolLM optimizer unavailable: ${String(error)}`,
    }
  }
}

function rewritePromptMessages(messages: ProxyRequest['messages']): ProxyRequest['messages'] {
  const rewritten: ProxyRequest['messages'] = []
  let lastMessage: ProxyRequest['messages'][number] | null = null

  for (const message of messages) {
    const content = message.content.trim().replace(/\s+/g, ' ')
    if (!content) continue

    const candidate: ProxyRequest['messages'][number] = {
      role: message.role,
      content,
    }

    if (lastMessage && lastMessage.role === candidate.role && lastMessage.content === candidate.content) {
      continue
    }

    rewritten.push(candidate)
    lastMessage = candidate
  }

  return rewritten
}
