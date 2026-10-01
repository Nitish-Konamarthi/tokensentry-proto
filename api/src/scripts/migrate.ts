import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as schema from '../db/schema.js'

async function run() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const connection = postgres(connectionString, { max: 1 })
  const db = drizzle(connection, { schema })

  console.log('Running migrations...')

  await migrate(db, { migrationsFolder: './sql/drizzle' })

  await connection.end()

  console.log('Migrations complete')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
