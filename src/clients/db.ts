// src/clients/db.ts
// Raw postgres.js client for PostgreSQL (Supabase)
// Use pg`...` for all raw queries

import postgres from 'postgres'
import { logger } from '../utils/logger.js'

export const pg = postgres(process.env['DATABASE_URL']!, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,   // Required for Supabase PgBouncer
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
  onnotice: (notice) => logger.debug({ notice }, 'PG notice'),
})

// Type alias for query result rows
export type PgResult<T> = postgres.RowList<T[]>

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = await pg`SELECT 1 AS ok`
    return result[0]?.['ok'] === 1
  } catch {
    return false
  }
}

// ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────
export async function closeDb(): Promise<void> {
  await pg.end({ timeout: 5 })
}
