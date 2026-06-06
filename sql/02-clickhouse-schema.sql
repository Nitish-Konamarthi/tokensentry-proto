-- ═══════════════════════════════════════════════════════════
-- TOKENSENTRY — ClickHouse Schema
-- Run on: ClickHouse Cloud (Free Dev tier)
-- ═══════════════════════════════════════════════════════════

-- ── Main AI Call Events Table ──────────────────────────────
-- This is the source of truth for all analytics
-- Append-only, partitioned by month, TTL 2 years
CREATE TABLE IF NOT EXISTS ai_call_events (
  call_id               UUID,
  org_id                UUID,
  team_id               UUID,
  user_id               UUID,
  -- Model data
  model_used            LowCardinality(String),     -- actual model called
  model_requested       LowCardinality(String),     -- what client sent
  model_recommended     LowCardinality(String),     -- AI classifier's pick
  model_overridden      UInt8 DEFAULT 0,            -- 1 if policy overrode AI
  -- Token & cost data
  input_tokens          UInt32,
  output_tokens         UInt32,
  cost_usd              Float64,                    -- actual cost charged to customer
  meta_cost_usd         Float64,                    -- TokenSentry's own AI call cost
  saved_cost_usd        Float64,                    -- savings vs requested model
  -- Cache & optimization
  cache_hit             UInt8 DEFAULT 0,
  optimization_applied  UInt8 DEFAULT 0,
  reduction_pct         Float32 DEFAULT 0,          -- prompt compression %
  -- Request metadata
  duration_ms           UInt32,
  task_complexity       LowCardinality(String),     -- low/medium/high/frontier
  preserve_priority     LowCardinality(String),     -- accuracy/speed/cost
  is_agentic            UInt8 DEFAULT 0,
  agent_id              Nullable(String),
  -- Error tracking
  error                 Nullable(String),
  status_code           UInt16 DEFAULT 200,
  -- Timestamp
  timestamp             DateTime64(3, 'UTC')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (org_id, team_id, timestamp)
  TTL timestamp + INTERVAL 2 YEAR
  SETTINGS index_granularity = 8192;

-- ── Hourly Rollup MV ───────────────────────────────────────
-- Powers ~90% of dashboard queries — pre-aggregated for speed
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_spend
ENGINE = SummingMergeTree()
ORDER BY (org_id, team_id, hour)
AS SELECT
  org_id,
  team_id,
  toStartOfHour(timestamp)              AS hour,
  sum(cost_usd)                         AS cost_usd,
  sum(saved_cost_usd)                   AS saved_usd,
  sum(meta_cost_usd)                    AS meta_cost_usd,
  countIf(cache_hit = 1)               AS cache_hits,
  count()                               AS total_calls,
  countIf(error IS NOT NULL)            AS error_calls,
  sum(input_tokens)                     AS input_tokens,
  sum(output_tokens)                    AS output_tokens,
  avg(reduction_pct)                    AS avg_reduction_pct,
  avg(duration_ms)                      AS avg_duration_ms,
  countIf(is_agentic = 1)              AS agentic_calls,
  countIf(model_overridden = 1)         AS overrides
FROM ai_call_events
GROUP BY org_id, team_id, hour;

-- ── Daily Rollup MV ────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_spend
ENGINE = SummingMergeTree()
ORDER BY (org_id, day)
AS SELECT
  org_id,
  toStartOfDay(timestamp)               AS day,
  sum(cost_usd)                         AS cost_usd,
  sum(saved_cost_usd)                   AS saved_usd,
  count()                               AS total_calls,
  countIf(cache_hit = 1)               AS cache_hits,
  sum(input_tokens)                     AS input_tokens,
  sum(output_tokens)                    AS output_tokens
FROM ai_call_events
GROUP BY org_id, day;

-- ── Model Distribution MV ──────────────────────────────────
-- Powers the "model breakdown" pie chart
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_model_distribution
ENGINE = SummingMergeTree()
ORDER BY (org_id, model_used, day)
AS SELECT
  org_id,
  model_used,
  toStartOfDay(timestamp)               AS day,
  count()                               AS calls,
  sum(cost_usd)                         AS cost_usd,
  sum(input_tokens)                     AS input_tokens,
  sum(saved_cost_usd)                   AS saved_usd
FROM ai_call_events
GROUP BY org_id, model_used, day;

-- ── Waste Pattern MV ───────────────────────────────────────
-- Used by WasteAnalyzer prompt — pre-computed waste signals
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_waste_signals
ENGINE = SummingMergeTree()
ORDER BY (org_id, team_id, day)
AS SELECT
  org_id,
  team_id,
  toStartOfDay(timestamp)               AS day,
  -- Over-routing: recommended cheaper but used expensive
  countIf(model_recommended != model_used AND
    indexOf(['claude-haiku-4-5'], model_recommended) > 0 AND
    indexOf(['claude-sonnet-4-6','claude-opus-4-6'], model_used) > 0
  )                                      AS over_routing_calls,
  -- Cache miss repeats (similar queries not cached)
  countIf(cache_hit = 0)               AS cache_misses,
  countIf(cache_hit = 1)               AS cache_hits,
  -- Context bloat proxy: high input tokens for low complexity
  countIf(input_tokens > 10000 AND task_complexity = 'low') AS context_bloat_calls,
  -- Agentic waste
  countIf(is_agentic = 1 AND input_tokens > 50000)         AS agentic_sprawl_calls,
  -- Total waste proxy
  sum(saved_cost_usd)                   AS total_savings,
  sum(cost_usd)                         AS total_spend
FROM ai_call_events
GROUP BY org_id, team_id, day;

-- ── Agent Sessions Table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_events (
  agent_id        String,
  org_id          UUID,
  event_type      LowCardinality(String),  -- 'turn','compress','terminate','complete'
  turn_count      UInt32,
  tokens_this_turn UInt32,
  tokens_total    UInt32,
  budget_utilized Float32,
  loop_detected   UInt8 DEFAULT 0,
  action_taken    LowCardinality(String),
  timestamp       DateTime64(3, 'UTC')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (org_id, agent_id, timestamp)
  TTL timestamp + INTERVAL 90 DAY;
