import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { generateApiKey } from '../lib/crypto.js'

async function run() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const connection = postgres(connectionString, { max: 1 })
  const db = drizzle(connection, { schema })

  const ORG_ID = '00000000-0000-0000-0000-000000000001'

  const existingOrg = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1)

  if (existingOrg.length > 0) {
    console.log('Seed data already exists, skipping')
    await connection.end()
    process.exit(0)
  }

  await db.insert(schema.organizations).values({
    id: ORG_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    plan: 'starter',
  })

  const teams = await db.insert(schema.teams).values({ orgId: ORG_ID, name: 'Engineering', slug: 'engineering' }).returning()
  await db.insert(schema.teams).values({ orgId: ORG_ID, name: 'Marketing', slug: 'marketing' })

  await db.insert(schema.budgets).values({
    orgId: ORG_ID,
    monthlyLimitMicros: '500000000.0000',
  })

  const { rawKey, keyHash, keyPrefix } = generateApiKey()
  const engTeam = teams[0]

  if (engTeam) {
    await db.insert(schema.apiKeys).values({
      orgId: ORG_ID,
      teamId: engTeam.id,
      keyHash,
      keyPrefix,
      name: 'Development Key',
    })
  }

  await connection.end()

  console.log('\n=== Test API Key ===')
  console.log(`\n  ${rawKey}\n`)
  console.log('curl -X POST http://localhost:3000/v1/proxy \\')
  console.log(`  -H "Authorization: Bearer ${rawKey}" \\`)
  console.log('  -H "Content-Type: application/json" \\')
  console.log('  -d \'{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}\'')
  console.log()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
