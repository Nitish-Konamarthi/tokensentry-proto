import postgres from 'postgres'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

export const pg = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  onnotice: (notice) => logger.debug({ notice }, 'PG notice'),
})

export async function checkPgHealth(): Promise<boolean> {
  try {
    const result = await pg`SELECT 1 AS ok`
    return result[0]?.['ok'] === 1
  } catch {
    return false
  }
}

export async function closePg(): Promise<void> {
  await pg.end({ timeout: 5 })
}
