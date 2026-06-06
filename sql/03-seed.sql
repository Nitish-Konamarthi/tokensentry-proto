-- ═══════════════════════════════════════════════════════════
-- TOKENSENTRY — Seed Data for Local Development
-- Run after: 01-postgres-schema.sql
-- ═══════════════════════════════════════════════════════════

-- ── Create test organization ───────────────────────────────
INSERT INTO organizations (
  id, name, slug, plan, model_policy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Acme Corp (Test)',
  'acme-corp-test',
  'business',
  '{
    "allowed_models": ["claude-haiku-4-5","claude-sonnet-4-6"],
    "max_model_tier": "sonnet",
    "require_classification": true,
    "allow_opus": false
  }'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- ── Create test team ───────────────────────────────────────
INSERT INTO teams (id, org_id, name, slug) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Engineering',
  'engineering'
) ON CONFLICT (org_id, slug) DO NOTHING;

-- ── Create budget policy ───────────────────────────────────
INSERT INTO budget_policies (
  id, org_id, monthly_limit_usd, daily_limit_usd, on_exhaustion
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  500.0000,
  25.0000,
  'downgrade'
) ON CONFLICT DO NOTHING;

-- ── Create test API key ────────────────────────────────────
-- Raw key:    ts_live_test_d3ad8eef4f2b1234
-- key_prefix: ts_live_tes
-- key_hash:   SHA-256 of "ts_live_test_d3ad8eef4f2b1234"
-- Use this for local dev: Authorization: Bearer ts_live_test_d3ad8eef4f2b1234
INSERT INTO api_keys (
  id, org_id, team_id, key_hash, key_prefix, name, scopes
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  -- SHA-256("ts_live_test_d3ad8eef4f2b1234")
  encode(sha256('ts_live_test_d3ad8eef4f2b1234'::bytea), 'hex'),
  'ts_live_tes',
  'Local Development Key',
  ARRAY['ai:proxy','analytics:read','budget:read']
) ON CONFLICT (key_hash) DO NOTHING;

-- ── Create Slack alert channel ─────────────────────────────
INSERT INTO alert_channels (
  id, org_id, channel_type, config, events
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'slack',
  '{"webhook_url": "https://hooks.slack.com/services/REPLACE_ME"}'::jsonb,
  ARRAY['budget_80','budget_95','budget_exceeded','agent_terminated']
) ON CONFLICT DO NOTHING;

-- Print summary
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'TokenSentry seed complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Test API Key: ts_live_test_d3ad8eef4f2b1234';
  RAISE NOTICE 'Org ID:       a0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'Team ID:      b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  curl -X POST http://localhost:3000/v1/proxy/messages \';
  RAISE NOTICE '    -H "Authorization: Bearer ts_live_test_d3ad8eef4f2b1234" \';
  RAISE NOTICE '    -H "Content-Type: application/json" \';
  RAISE NOTICE '    -d "{\"model\":\"claude-opus-4-6\",\"max_tokens\":50,\"messages\":[{\"role\":\"user\",\"content\":\"What is 2+2?\"}]}"';
  RAISE NOTICE '════════════════════════════════════════';
END$$;
