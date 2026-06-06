// src/scripts/migrate.ts — Database migration runner
// Run with: npm run db:migrate
// Applies all pending Drizzle migrations

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function runMigrations(): Promise<void> {
  console.log('🔄 Running database migrations...')

  const connection = postgres(process.env['DATABASE_URL']!, {
    max: 1,
    prepare: false,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
  })

  const db = drizzle(connection)

  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('✅ Migrations complete')
  } finally {
    await connection.end({ timeout: 5 })
  }
}

runMigrations().catch((err: unknown) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
