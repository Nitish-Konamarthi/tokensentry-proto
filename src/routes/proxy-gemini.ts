// src/routes/proxy-gemini.ts
// Drop-in replacement for Google AI Studio / Gemini API.
// Governs all Antigravity CLI and Gemini SDK calls.
// Customer sets: GEMINI_BASE_URL=https://api.tokensentry.ai/v1/gemini/proxy

import { FastifyInstance } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { BudgetGovernor } from '../pillars/governor.js'
import { analyticsQueue } from '../queues/index.js'
import { getDecryptedApiKey } from '../clients/vault.js'

const GEMINI_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro':       { input: 3.50,  output: 10.50 },
  'gemini-2.5-flash':     { input: 0.30,  output: 2.50  },
  'gemini-2.0-flash':     { input: 0.10,  output: 0.40  },
  'gemini-2.0-flash-exp': { input: 0.00,  output: 0.00  }, // Free experimental
  'gemini-1.5-pro':       { input: 1.25,  output: 5.00  },
  'gemini-1.5-flash':     { input: 0.075, output: 0.30  },
}

const governor = new BudgetGovernor()

export async function proxyGeminiRoutes(app: FastifyInstance): Promise<void> {

  // POST /v1/gemini/proxy/v1beta/models/:model:generateContent
  // Mirrors Google AI Studio API path exactly.
  // Antigravity and all Gemini SDK tools call this path.
  app.post('/v1beta/models/:model\\:generateContent', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const { model } = request.params as { model: string }
    const body = request.body as Record<string, unknown>
    const { orgId, teamId, userId } = request.authContext
    const effectiveTeamId = teamId ?? orgId
    const effectiveUserId = userId ?? 'unknown'
    const callId = request.id

    const customerKey = await getDecryptedApiKey(orgId, 'gemini')
    if (!customerKey) {
      return reply.status(400).send({
        error: {
          code: 400,
          message: 'No Gemini API key configured. Add one at app.tokensentry.ai/settings/providers',
          status: 'FAILED_PRECONDITION',
        }
      })
    }

    // Estimate tokens from contents
    const contents = body['contents'] as Array<{ parts?: Array<{ text?: string }> }> | undefined
    const inputTokens = (contents ?? []).reduce((sum: number, c) => {
      const text = Array.isArray(c.parts) ? c.parts.map((p) => p.text ?? '').join('') : ''
      return sum + Math.ceil(text.length / 4)
    }, 0)

    const costs = GEMINI_COSTS[model] ?? { input: 1.00, output: 4.00 }
    const estimatedCost = (inputTokens / 1_000_000) * costs.input + (500 / 1_000_000) * costs.output

    const budgetCheck = await governor.checkAndDeduct({
      orgId,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      estimatedCost,
      budgets: { user: 999999, team: 999999, org: 999999 },
    })

    if (!budgetCheck.approved) {
      return reply.status(429).send({
        error: {
          code: 429,
          message: `TokenSentry: ${budgetCheck.reason}. See https://app.tokensentry.ai/budgets`,
          status: 'RESOURCE_EXHAUSTED',
        }
      })
    }

    // Forward to Google AI
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${customerKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const data = await res.json() as Record<string, unknown>
    const usageMetadata = data['usageMetadata'] as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    } | undefined

    void analyticsQueue.add('ai_call_event', {
      callId,
      orgId,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      modelUsed:        model,
      modelRequested:   model,
      modelRecommended: model,
      provider:         'gemini',
      inputTokens:      usageMetadata?.promptTokenCount ?? 0,
      outputTokens:     usageMetadata?.candidatesTokenCount ?? 0,
      costUsd:          estimatedCost,
      savedCostUsd:     0,
      cacheHit:         false,
      optimizationApplied: false,
      reductionPct:     0,
      durationMs:       Date.now() - ((request as unknown as Record<string, number>)['startTime'] ?? Date.now()),
      taskComplexity:   'unknown',
      isAgentic:        false,
      timestamp:        new Date().toISOString(),
    })

    return reply
      .header('X-TS-Provider', 'gemini')
      .header('X-TS-Call-Id', callId)
      .header('X-TS-Budget-Util', budgetCheck.utilization.toFixed(3))
      .send(data)
  })

  // POST /v1beta/models/:model:streamGenerateContent — streaming SSE variant
  app.post('/v1beta/models/:model\\:streamGenerateContent', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const { model } = request.params as { model: string }
    const body = request.body as Record<string, unknown>
    const customerKey = await getDecryptedApiKey(request.authContext.orgId, 'gemini')
    if (!customerKey) return reply.status(400).send({ error: { message: 'No Gemini key configured' } })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${customerKey}&alt=sse`
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (upstream.body) {
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply.raw.write(decoder.decode(value))
      }
    }
    reply.raw.end()
  })
}
