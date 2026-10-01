import { spawn } from 'node:child_process'
import { env } from '../../config/env.js'
import type { ProxyRequest } from '../../types/index.js'

const DEFAULT_TIMEOUT_MS = 50

export async function optimizeWithSmolLocalModel(params: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  orgPolicy: Record<string, unknown>
}): Promise<ProxyRequest['messages']> {
  const command = env.SMOL_LLM_OPTIMIZER_COMMAND
  if (!command) {
    throw new Error('SMOL_LLM_OPTIMIZER_COMMAND not configured')
  }

  const prompt = buildOptimizerPrompt(params)
  const timeout = env.SMOL_LLM_OPTIMIZER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS

  return new Promise<ProxyRequest['messages']>((resolve, reject) => {
    const child = spawn(command, [], { stdio: ['pipe', 'pipe', 'inherit'] })
    let stdout = ''
    let resolved = false

    const handleError = (error: Error) => {
      if (resolved) return
      resolved = true
      reject(new Error(`SmolLM optimizer failed: ${String(error)}`))
    }

    const timeoutHandle = setTimeout(() => {
      if (resolved) return
      resolved = true
      child.kill('SIGTERM')
      reject(new Error(`SmolLM optimizer exceeded ${timeout}ms timeout`))
    }, timeout)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.on('error', handleError)

    child.on('exit', (code, signal) => {
      clearTimeout(timeoutHandle)
      if (resolved) return
      if (code !== 0) {
        resolved = true
        reject(new Error(`SmolLM optimizer failed with code ${code} signal ${signal}`))
        return
      }

      try {
        const parsed = parseOptimizerOutput(stdout)
        const normalized = normalizeOptimizerMessages(parsed, params.messages)
        resolved = true
        resolve(normalized)
      } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)))
      }
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function buildOptimizerPrompt(params: {
  model: string
  system?: string
  messages: ProxyRequest['messages']
  orgPolicy: Record<string, unknown>
}): string {
  const system = params.system?.trim() ?? ''
  const userMessages = params.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n')

  return [`Optimize only when token savings are clearly available.`,
    `Do not answer the prompt. Do not change user intent. Do not invent new requirements.`,
    `Return the original prompt unchanged if optimization is unnecessary.`,
    `Keep the same meaning and task.`,
    `Output only the optimized prompt content in JSON format: {"messages": [{"role":"user","content":"..."}, ...]}.`,
    `System: ${system}`,
    `Messages:\n${userMessages}`,
    `Org policy: ${JSON.stringify(params.orgPolicy)}`].join('\n')
}

function parseOptimizerOutput(stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error('Failed to parse SmolLM optimizer JSON output')
  }
}

function normalizeOptimizerMessages(parsed: unknown, originalMessages: ProxyRequest['messages']): ProxyRequest['messages'] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SmolLM optimizer output is invalid')
  }

  const maybeMessages = (parsed as { messages?: unknown }).messages
  if (!Array.isArray(maybeMessages) || maybeMessages.some((item) => typeof item !== 'object' || typeof item?.role !== 'string' || typeof item?.content !== 'string')) {
    throw new Error('SmolLM optimizer output must include messages array with role and content')
  }

  const normalized = maybeMessages.map((message) => ({
    role: message.role,
    content: message.content.trim().replace(/\s+/g, ' '),
  })) as ProxyRequest['messages']

  if (!normalized.length) {
    return originalMessages
  }

  return normalized
}
