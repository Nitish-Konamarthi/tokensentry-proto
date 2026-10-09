-- TokenSentry PostgreSQL Schema
-- Clean architecture: users, teams, api_keys, budgets, usage_logs, routing_logs, audit_logs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Organizations ──

CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  plan              TEXT NOT NULL DEFAULT 'starter',
  admin_email       TEXT,
  model_policy      JSONB NOT NULL DEFAULT '{"allowed_models":["anthropic/claude-haiku-4-5","anthropic/claude-sonnet-4-6"],"max_model_tier":"high","require_classification":true,"allow_opus":false}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Teams ──

CREATE TABLE teams (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL,
  UNIQUE (org_id, slug)
);

-- ── Org Members ──

CREATE TABLE org_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL,
  role     TEXT NOT NULL DEFAULT 'member',
  email    TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- ── API Keys ──

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  team_id      UUID REFERENCES teams(id),
  user_id      UUID,
  key_hash     CHAR(64) NOT NULL UNIQUE,
  key_prefix   CHAR(16) NOT NULL,
  name         TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{proxy}',
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX idx_api_keys_active_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- ── Budgets ──

CREATE TABLE budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  team_id               UUID REFERENCES teams(id),
  user_id               UUID,
  monthly_limit_micros  DECIMAL(16,4) NOT NULL,
  daily_limit_micros    DECIMAL(16,4),
  alert_at_80_pct       BOOLEAN DEFAULT true,
  alert_at_95_pct       BOOLEAN DEFAULT true,
  on_exhaustion         TEXT DEFAULT 'block',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budgets_org ON budgets(org_id);

-- ── Usage Logs ──

CREATE TABLE usage_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  team_id        UUID REFERENCES teams(id),
  user_id        UUID,
  api_key_id     UUID REFERENCES api_keys(id),
  call_id        TEXT NOT NULL,
  model          TEXT NOT NULL,
  provider       TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_micros    INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  cache_hit      BOOLEAN NOT NULL DEFAULT false,
  streamed       BOOLEAN NOT NULL DEFAULT false,
  usage_estimated BOOLEAN NOT NULL DEFAULT false,
  status_code    INTEGER NOT NULL DEFAULT 200,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_org_created ON usage_logs(org_id, created_at DESC);
CREATE INDEX idx_usage_logs_model ON usage_logs(org_id, model);
CREATE INDEX idx_usage_logs_provider ON usage_logs(org_id, provider);

-- ── Routing Logs ──

CREATE TABLE routing_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  call_id             TEXT NOT NULL,
  requested_model     TEXT NOT NULL,
  recommended_model   TEXT,
  approved_model      TEXT NOT NULL,
  complexity          TEXT,
  confidence          DECIMAL(4,3),
  reasoning           TEXT,
  estimated_cost_usd  DECIMAL(12,6),
  overridden          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routing_logs_org ON routing_logs(org_id, created_at DESC);

-- ── Audit Logs ──

CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id),
  actor_id   UUID,
  action     TEXT NOT NULL,
  resource   TEXT NOT NULL,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_action ON audit_logs(org_id, created_at DESC);

-- ── Provider Health ──

CREATE TABLE provider_health (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'healthy',
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_at   TIMESTAMPTZ,
  error_count     INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms  INTEGER
);

-- ── Updated At Trigger ──

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Note: Seed data is created programmatically via `npm run db:seed` (src/scripts/seed.ts)
