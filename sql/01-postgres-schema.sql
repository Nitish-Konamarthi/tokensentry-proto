-- ═══════════════════════════════════════════════════════════
-- TOKENSENTRY — PostgreSQL Schema
-- Run on: Supabase (PostgreSQL 16)
-- ═══════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector: semantic cache embeddings
CREATE EXTENSION IF NOT EXISTS pg_cron;     -- Scheduled cleanup jobs
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()

-- ── Organizations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  plan                  TEXT NOT NULL DEFAULT 'starter'
                        CHECK (plan IN ('starter','business','enterprise')),
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  -- Encrypted references to Supabase Vault
  anthropic_key_ref     TEXT,
  openai_key_ref        TEXT,
  gemini_key_ref        TEXT,
  -- Default model access policy
  model_policy JSONB NOT NULL DEFAULT '{
    "allowed_models": ["claude-haiku-4-5","claude-sonnet-4-6"],
    "max_model_tier": "sonnet",
    "require_classification": true,
    "allow_opus": false
  }'::jsonb,
  -- Metadata
  company_size          TEXT CHECK (company_size IN ('<10','10-50','50-250','250+')),
  primary_ai_use        TEXT,
  intercom_contact_id   TEXT,
  timezone              TEXT DEFAULT 'UTC',
  active                BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_orgs_slug ON organizations(slug);
CREATE INDEX idx_orgs_stripe ON organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ── Teams ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_teams_org ON teams(org_id);

-- ── Members (org users) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,          -- Auth0 sub (stored as UUID-like string)
  auth0_sub   TEXT NOT NULL UNIQUE,   -- Auth0 user_id string (e.g. "google|123")
  email       TEXT NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner','admin','member','viewer','agent')),
  team_id     UUID REFERENCES teams(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE(org_id, auth0_sub)
);

CREATE INDEX idx_members_org ON org_members(org_id);
CREATE INDEX idx_members_auth0 ON org_members(auth0_sub);

-- ── Budget Policies (hierarchical: org > team > user) ──────
CREATE TABLE IF NOT EXISTS budget_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id               UUID,                      -- org_members.user_id
  monthly_limit_usd     DECIMAL(12,4) NOT NULL,
  daily_limit_usd       DECIMAL(12,4),
  alert_at_80_pct       BOOLEAN DEFAULT TRUE,
  alert_at_95_pct       BOOLEAN DEFAULT TRUE,
  on_exhaustion         TEXT DEFAULT 'downgrade'
                        CHECK (on_exhaustion IN ('block','downgrade','alert_only')),
  downgrade_to_model    TEXT DEFAULT 'claude-haiku-4-5',
  model_policy_override JSONB,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  -- Constraint: only one scope level per policy
  CONSTRAINT single_scope CHECK (
    (team_id IS NULL AND user_id IS NULL) OR
    (team_id IS NOT NULL AND user_id IS NULL) OR
    (team_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_budget_org ON budget_policies(org_id);
CREATE INDEX idx_budget_team ON budget_policies(team_id) WHERE team_id IS NOT NULL;

-- ── API Keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id),
  user_id       UUID,
  key_hash      CHAR(64) NOT NULL UNIQUE,   -- SHA-256 of raw key (hex)
  key_prefix    CHAR(12) NOT NULL,           -- "ts_live_xxxx" for display
  name          TEXT NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['ai:proxy'],
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  last_used_ip  INET,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE INDEX idx_apikeys_org ON api_keys(org_id);
CREATE INDEX idx_apikeys_hash ON api_keys(key_hash);
CREATE INDEX idx_apikeys_active ON api_keys(org_id) WHERE revoked_at IS NULL;

-- ── Semantic Cache (pgvector) ──────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_hash     CHAR(64) NOT NULL,         -- SHA-256 of normalized prompt
  embedding       vector(1024) NOT NULL,      -- Voyage AI voyage-3 embedding
  prompt_preview  TEXT NOT NULL,             -- First 500 chars for debugging
  response        TEXT,                       -- Cached AI response
  model_used      TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_hit_at     TIMESTAMPTZ DEFAULT NOW(),
  hit_count       INTEGER DEFAULT 0,
  UNIQUE(org_id, prompt_hash)
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX semantic_cache_hnsw ON semantic_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_semantic_cache_org ON semantic_cache(org_id);
CREATE INDEX idx_semantic_cache_created ON semantic_cache(created_at);

-- ── Alert Channels ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL
               CHECK (channel_type IN ('slack','email','webhook','pagerduty')),
  config       JSONB NOT NULL,   -- channel-specific config (webhook_url, etc.)
  events       TEXT[] NOT NULL
               DEFAULT ARRAY['budget_80','budget_95','budget_exceeded','agent_terminated'],
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_org ON alert_channels(org_id);

-- ── Webhook Deliveries (audit trail) ──────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id   UUID REFERENCES alert_channels(id),
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status       TEXT DEFAULT 'pending'
               CHECK (status IN ('pending','delivered','failed')),
  attempts     INTEGER DEFAULT 0,
  last_error   TEXT,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_org ON webhook_deliveries(org_id);
CREATE INDEX idx_webhooks_status ON webhook_deliveries(status) WHERE status = 'pending';

-- ── Agentic Sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES teams(id),
  user_id               UUID,
  agent_id              TEXT NOT NULL UNIQUE,   -- client-provided agent identifier
  task_description      TEXT,
  token_budget          INTEGER NOT NULL DEFAULT 100000,
  tokens_consumed       INTEGER DEFAULT 0,
  turn_count            INTEGER DEFAULT 0,
  status                TEXT DEFAULT 'active'
                        CHECK (status IN ('active','warning','terminated','completed')),
  termination_reason    TEXT,
  loop_detected         BOOLEAN DEFAULT FALSE,
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  terminated_at         TIMESTAMPTZ,
  last_check_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_org ON agent_sessions(org_id);
CREATE INDEX idx_agent_id ON agent_sessions(agent_id);
CREATE INDEX idx_agent_active ON agent_sessions(status) WHERE status = 'active';

-- ── Row Level Security ─────────────────────────────────────
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_policies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions      ENABLE ROW LEVEL SECURITY;

-- Policy: service role bypasses RLS (for our API server)
-- Policy: users can only see their own org's data
CREATE POLICY org_isolation ON teams
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON org_members
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON budget_policies
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON api_keys
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON semantic_cache
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON alert_channels
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON webhook_deliveries
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

CREATE POLICY org_isolation ON agent_sessions
  FOR ALL USING (org_id = (current_setting('app.current_org_id', TRUE))::uuid);

-- ── Auto-updated timestamps ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_budget_updated_at
  BEFORE UPDATE ON budget_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Scheduled cleanup (pg_cron) ───────────────────────────
-- Clean semantic cache older than 7 days at 3am daily
SELECT cron.schedule(
  'clean-semantic-cache',
  '0 3 * * *',
  $$ DELETE FROM semantic_cache WHERE created_at < NOW() - INTERVAL '7 days' $$
);

-- Clean old webhook deliveries older than 90 days
SELECT cron.schedule(
  'clean-webhook-deliveries',
  '0 4 * * 0',
  $$ DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '90 days' $$
);
