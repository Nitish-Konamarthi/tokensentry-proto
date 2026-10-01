import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'
import { env } from '../config/env.js'

const connection = postgres(env.DATABASE_URL, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export const db = drizzle(connection, { schema })
export type DB = typeof db
