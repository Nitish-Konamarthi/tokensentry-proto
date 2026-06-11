// src/routes/proxy-openai.ts
// Drop-in replacement for OpenAI API — governs Codex CLI and all OpenAI SDK tools.
// Customer sets: OPENAI_BASE_URL=https://api.tokensentry.ai/v1/openai/proxy

import { FastifyInstance } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { BudgetGovernor } from '../pillars/governor.js'
import { analyticsQueue } from '../queues/index.js'
import { getDecryptedApiKey } from '../clients/vault.js'

const OPENAI_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60  },
  'gpt-4.1':         { input: 2.00,  output: 8.00  },
  'gpt-4.1-mini':    { input: 0.40,  output: 1.60  },
  'gpt-5.5':         { input: 25.00, output: 100.00 },
  'o3':              { input: 10.00, output: 40.00 },
  'o4-mini':         { input: 1.10,  output: 4.40  },
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = OPENAI_COSTS[model] ?? { input: 3.00, output: 12.00 }
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
}

const governor = new BudgetGovernor()

export async function proxyOpenAIRoutes(app: FastifyInstance): Promise<void> {

  // POST /v1/openai/proxy/chat/completions
  // Drop-in replacement for https://api.openai.com/v1/chat/completions
  app.post('/chat/completions', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const { orgId, teamId, userId } = request.authContext
    const effectiveTeamId = teamId ?? orgId
    const effectiveUserId = userId ?? 'unknown'
    const callId = request.id

    // Get customer's OpenAI key from Vault
    const customerKey = await getDecryptedApiKey(orgId, 'openai')
    if (!customerKey) {
      return reply.status(400).send({
        error: {
          type: 'invalid_request_error',
          code: 'no_provider_key',
          message: 'No OpenAI API key configured. Add one at app.tokensentry.ai/settings/providers',
        }
      })
    }

    // Estimate cost for budget check
    const messages = body['messages'] as Array<{ content: string | unknown }> | undefined
    const inputTokens = messages?.reduce((sum: number, m) =>
      sum + (typeof m.content === 'string' ? m.content.length / 4 : 100), 0) ?? 200
    const modelName = (body['model'] as string | undefined) ?? 'gpt-4o'
    const estimatedCost = estimateCost(modelName, inputTokens, 500)

    // Budget enforcement (same Lua script as Anthropic proxy)
    const budgetCheck = await governor.checkAndDeduct({
      orgId,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      estimatedCost,
      budgets: {
        user: 999999, // TODO: fetch from DB
        team: 999999,
        org: 999999,
      },
    })

    if (!budgetCheck.approved) {
      return reply.status(429).send({
        error: {
          type: 'budget_exceeded',
          code: 'TOKENSENTRY_BUDGET_EXCEEDED',
          message: `TokenSentry: ${budgetCheck.reason}. Monthly budget: $${budgetCheck.limit_usd}. Spent: $${budgetCheck.current_spend_usd.toFixed(4)}. Dashboard: https://app.tokensentry.ai/budgets`,
        }
      })
    }

    // Forward to OpenAI
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `TokenSentry/1.0`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const data = await res.json() as Record<string, unknown>
    const usage = data['usage'] as { prompt_tokens?: number; completion_tokens?: number } | undefined

    // Track analytics
    void analyticsQueue.add('ai_call_event', {
      callId,
      orgId,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      modelUsed:        modelName,
      modelRequested:   modelName,
      modelRecommended: modelName,
      provider:         'openai',
      inputTokens:      usage?.prompt_tokens ?? 0,
      outputTokens:     usage?.completion_tokens ?? 0,
      costUsd:          estimateCost(modelName, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
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
      .header('X-TS-Provider', 'openai')
      .header('X-TS-Call-Id', callId)
      .header('X-TS-Budget-Util', budgetCheck.utilization.toFixed(3))
      .send(data)
  })

  // GET /v1/openai/proxy/models — proxy the models list too
  app.get('/models', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const customerKey = await getDecryptedApiKey(request.authContext.orgId, 'openai')
    if (!customerKey) return reply.status(400).send({ error: { message: 'No OpenAI key configured' } })

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${customerKey}` },
    })
    return reply.send(await res.json())
  })
}
