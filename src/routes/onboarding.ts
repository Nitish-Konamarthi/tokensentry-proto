// src/routes/onboarding.ts — Onboarding Flow (§B5)
// POST /v1/onboarding/* — Welcome, setup, key provisioning

import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { generateApiKey } from '../utils/crypto.js'
import { pg } from '../clients/db.js'
import { logger } from '../utils/logger.js'

export async function onboardingRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /v1/onboarding/setup — Complete initial org setup (called by dashboard on first login)
  fastify.post('/v1/onboarding/setup', {
    schema: {
      body: Type.Object({
        org_name:     Type.String({ minLength: 2, maxLength: 100 }),
        org_slug:     Type.String({ minLength: 2, maxLength: 60, pattern: '^[a-z0-9-]+$' }),
        admin_email:  Type.String({ format: 'email' }),
        plan:         Type.Optional(Type.Union([
          Type.Literal('starter'),
          Type.Literal('business'),
          Type.Literal('enterprise'),
        ])),
        monthly_budget_usd: Type.Optional(Type.Number({ minimum: 1 })),
      }),
    },
  }, async (request, reply) => {
    const body = request.body as {
      org_name: string; org_slug: string; admin_email: string
      plan?: string; monthly_budget_usd?: number
    }

    // Check slug uniqueness
    const existing = await pg<Array<{ id: string }>>`
      SELECT id FROM organizations WHERE slug = ${body.org_slug}
    `
    if (existing.length > 0) {
      return reply.code(409).send({
        error: 'SLUG_TAKEN',
        message: `Organization slug '${body.org_slug}' is already taken`,
      })
    }

    // Create organization
    const [org] = await pg<Array<{ id: string }>>`
      INSERT INTO organizations (name, slug, plan, admin_email)
      VALUES (${body.org_name}, ${body.org_slug}, ${body.plan ?? 'starter'}, ${body.admin_email})
      RETURNING id
    `

    if (!org) throw new Error('Failed to create organization')

    // Create default budget policy
    const budgetLimit = body.monthly_budget_usd ?? 100
    await pg`
      INSERT INTO budget_policies (org_id, monthly_limit_usd, alert_at_80_pct, alert_at_95_pct, on_exhaustion)
      VALUES (${org.id}, ${budgetLimit}, true, true, 'block')
    `

    // Generate first API key
    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    await pg`
      INSERT INTO api_keys (org_id, key_hash, key_prefix, name, scopes)
      VALUES (${org.id}, ${keyHash}, ${keyPrefix}, 'Default Key', ARRAY['ai:proxy', 'analytics:read', 'budgets:write'])
    `

    logger.info({ orgId: org.id, slug: body.org_slug }, 'New organization onboarded')

    return reply.code(201).send({
      org_id: org.id,
      org_slug: body.org_slug,
      plan: body.plan ?? 'starter',
      monthly_budget_usd: budgetLimit,
      api_key: rawKey,       // SHOWN ONCE — not stored in plaintext
      key_prefix: keyPrefix,
      next_steps: [
        'Store your API key securely — it won\'t be shown again',
        'Set your Anthropic API key at /v1/onboarding/provider-key',
        'Make your first test call to /v1/proxy/messages',
      ],
    })
  })

  // POST /v1/onboarding/provider-key — Store customer's AI provider API key (encrypted in Vault)
  fastify.post('/v1/onboarding/provider-key', {
    schema: {
      body: Type.Object({
        org_id:   Type.String({ format: 'uuid' }),
        provider: Type.Literal('anthropic'),
        api_key:  Type.String({ minLength: 20 }),
      }),
    },
  }, async (request, reply) => {
    const body = request.body as { org_id: string; provider: string; api_key: string }

    // Validate key format
    if (!body.api_key.startsWith('sk-ant-')) {
      return reply.code(400).send({
        error: 'INVALID_KEY_FORMAT',
        message: 'Anthropic API keys start with sk-ant-',
      })
    }

    // Store in Supabase Vault (encrypted at rest)
    const vaultRows = await pg<Array<{ id: string }>>`
      SELECT vault.create_secret(${body.api_key}, ${`anthropic:${body.org_id}`}, 'Anthropic API key for ' || ${body.org_id}) AS id
    `
    const vaultId = vaultRows[0]?.id
    if (!vaultId) {
      return reply.code(500).send({ error: 'VAULT_ERROR', message: 'Failed to store key securely' })
    }

    // Store vault reference in org record
    await pg`
      UPDATE organizations SET anthropic_key_ref = ${vaultId} WHERE id = ${body.org_id}
    `

    logger.info({ orgId: body.org_id, provider: body.provider }, 'Provider API key stored in Vault')

    return reply.send({
      provider: body.provider,
      stored: true,
      vault_id: vaultId,
      message: 'API key encrypted and stored. You can now make proxy calls.',
    })
  })

  // POST /v1/onboarding/verify — Verify setup by making a test call
  fastify.post('/v1/onboarding/verify', {
    schema: {
      body: Type.Object({
        api_key: Type.String(),  // The ts_live_ key
      }),
    },
  }, async (request, reply) => {
    // This endpoint just validates the token — actual call is made by the client
    const body = request.body as { api_key: string }

    if (!body.api_key.startsWith('ts_')) {
      return reply.code(400).send({ error: 'INVALID_KEY', message: 'Key must start with ts_' })
    }

    return reply.send({
      valid: true,
      proxy_url: 'https://api.tokensentry.ai/v1/proxy/messages',
      test_command: `curl -X POST https://api.tokensentry.ai/v1/proxy/messages \\\n  -H "Authorization: Bearer ${body.api_key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude-opus-4-6","max_tokens":20,"messages":[{"role":"user","content":"Hi"}]}'`,
      expected_headers: {
        'X-TS-Approved-Model': 'claude-haiku-4-5',
        'X-TS-Cache-Hit': 'false',
        'X-TS-Cost-Usd': '~0.000001',
      },
    })
  })
}
