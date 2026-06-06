// src/scripts/seed.ts — Development database seeder (§D3)
// Run with: npm run db:seed
// Creates a test org, team, budget policy, and API key

import { createHash, randomBytes } from 'crypto'
import { pg } from '../clients/db.js'

async function seed(): Promise<void> {
  console.log('🌱 Seeding development database...\n')

  // ── Create test organization ───────────────────────────────────────
  const [org] = await pg<Array<{ id: string }>>`
    INSERT INTO organizations (name, slug, plan, admin_email, model_policy)
    VALUES (
      'Acme Corp (Test)',
      'acme-test',
      'business',
      'admin@acme-test.com',
      '{"allowed_models":["claude-haiku-4-5","claude-sonnet-4-6"],"max_model_tier":"sonnet","require_classification":true,"allow_opus":false}'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `
  if (!org) throw new Error('Failed to create organization')
  console.log(`✓ Organization: ${org.id}`)

  // ── Create test team ───────────────────────────────────────────────
  const [team] = await pg<Array<{ id: string }>>`
    INSERT INTO teams (org_id, name, slug)
    VALUES (${org.id}, 'Platform Engineering', 'platform-eng')
    ON CONFLICT (org_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!team) throw new Error('Failed to create team')
  console.log(`✓ Team: ${team.id}`)

  // ── Create budget policy ($500/month) ──────────────────────────────
  await pg`
    INSERT INTO budget_policies
      (org_id, monthly_limit_usd, alert_at_80_pct, alert_at_95_pct, on_exhaustion, downgrade_to_model)
    VALUES (${org.id}, 500.0000, true, true, 'block', 'claude-haiku-4-5')
    ON CONFLICT (org_id) WHERE team_id IS NULL AND user_id IS NULL
    DO UPDATE SET monthly_limit_usd = 500.0000
  `
  console.log(`✓ Budget policy: $500/month`)

  // ── Generate test API key ──────────────────────────────────────────
  const rawKey = `ts_live_test_${randomBytes(16).toString('hex')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 12)

  await pg`
    INSERT INTO api_keys (org_id, team_id, key_hash, key_prefix, name, scopes)
    VALUES (
      ${org.id}, ${team.id}, ${keyHash}, ${keyPrefix},
      'Development Key',
      ARRAY['ai:proxy', 'analytics:read', 'budgets:write']
    )
    ON CONFLICT (key_hash) DO NOTHING
  `

  console.log(`\n✅ Seed complete!\n`)
  console.log(`YOUR TEST API KEY (save this — shown once):`)
  console.log(`  ${rawKey}\n`)
  console.log(`Quick test:`)
  console.log(`  curl -X POST http://localhost:3000/v1/proxy/messages \\`)
  console.log(`    -H "Authorization: Bearer ${rawKey}" \\`)
  console.log(`    -H "Content-Type: application/json" \\`)
  console.log(`    -d '{"model":"claude-opus-4-6","max_tokens":50,"messages":[{"role":"user","content":"What is 2+2?"}]}'`)
  console.log(`\nExpect: X-TS-Approved-Model: claude-haiku-4-5 (routing working!)`)

  await pg.end({ timeout: 5 })
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
