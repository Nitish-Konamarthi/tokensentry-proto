// src/clients/clickhouse.ts
// ClickHouse client for analytics event ingestion and queries

import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { logger } from '../utils/logger.js'

let _clickhouse: ClickHouseClient | null = null

export function getClickhouse(): ClickHouseClient {
  if (_clickhouse) return _clickhouse

  _clickhouse = createClient({
    url: process.env['CLICKHOUSE_URL']!,
    username: process.env['CLICKHOUSE_USER'] ?? 'default',
    password: process.env['CLICKHOUSE_PASS']!,
    database: process.env['CLICKHOUSE_DB'] ?? 'tokensentry',
    request_timeout: 30_000,
    compression: {
      response: true,
      request: false,  // don't compress writes — lower latency
    },
    clickhouse_settings: {
      async_insert: 1,            // batch inserts automatically
      wait_for_async_insert: 0,   // fire-and-forget (analytics can lag)
      async_insert_max_data_size: '10000000',
      async_insert_busy_timeout_ms: 1000,
    },
  })

  logger.info('ClickHouse client initialized')
  return _clickhouse
}

export const clickhouse = new Proxy({} as ClickHouseClient, {
  get(_target, prop) {
    return (getClickhouse() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// ─── AI CALL EVENT TYPE ────────────────────────────────────────────────────
export interface AICallEvent {
  call_id: string
  org_id: string
  team_id: string
  user_id: string
  model_used: string
  model_requested: string
  model_recommended: string
  model_overridden: 0 | 1
  input_tokens: number
  output_tokens: number
  cost_usd: number
  meta_cost_usd: number
  saved_cost_usd: number
  cache_hit: 0 | 1
  optimization_applied: 0 | 1
  reduction_pct: number
  duration_ms: number
  task_complexity: string
  preserve_priority: string
  is_agentic: 0 | 1
  agent_id?: string | null
  error?: string | null
  status_code: number
  timestamp: string   // ISO8601
}

// ─── INSERT EVENTS ─────────────────────────────────────────────────────────
export async function insertCallEvent(event: AICallEvent): Promise<void> {
  try {
    await clickhouse.insert({
      table: 'ai_call_events',
      values: [event],
      format: 'JSONEachRow',
    })
  } catch (err) {
    // Analytics failures must never crash the proxy — log and continue
    logger.error({ err, callId: event.call_id }, 'ClickHouse insert failed')
  }
}

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
export async function checkClickhouseHealth(): Promise<boolean> {
  try {
    const result = await clickhouse.query({ query: 'SELECT 1', format: 'JSONEachRow' })
    await result.json()
    return true
  } catch {
    return false
  }
}

// ─── CLOSE ─────────────────────────────────────────────────────────────────
export async function closeClickhouse(): Promise<void> {
  if (_clickhouse) {
    await _clickhouse.close()
    _clickhouse = null
  }
}
