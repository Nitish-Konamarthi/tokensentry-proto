// src/db/index.ts — Drizzle DB connection (§D2)
// Exports the Drizzle ORM instance for use in query builders
// Note: raw SQL queries use pg from src/clients/db.ts

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

// Separate connection for Drizzle ORM (named queries, joins)
// Use smaller pool than the raw pg client
const connection = postgres(process.env['DATABASE_URL']!, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,  // Required for Supabase PgBouncer
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
})

export const db = drizzle(connection, { schema })

export type DB = typeof db
