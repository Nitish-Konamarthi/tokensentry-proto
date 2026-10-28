import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { env } from '../config/env.js'
import * as schema from '../db/schema.js'
import { generateApiKey } from '../lib/crypto.js'

const DEFAULT_ORG_NAME = 'TokenSentry Demo'
const DEFAULT_ORG_SLUG = 'tokensentry-demo'
const DEFAULT_MONTHLY_BUDGET_USD = 10
const INITIAL_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function run(): Promise<void> {
  const prompt = createInterface({ input: stdin, output: stdout })
  const connection = postgres(env.DATABASE_URL, { max: 1 })
  const db = drizzle(connection, { schema })

  try {
    console.log('TokenSentry V1 production bootstrap')
    console.log('This creates the first organization and a one-time owner API key.')
    const orgName = (await prompt.question(`Organization name [${DEFAULT_ORG_NAME}]: `)).trim() || DEFAULT_ORG_NAME
    const suggestedSlug = slugify(orgName) || DEFAULT_ORG_SLUG
    const orgSlug = (await prompt.question(`Organization slug [${suggestedSlug}]: `)).trim().toLowerCase() || suggestedSlug
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(orgSlug)) {
      throw new Error('Organization slug must contain lowercase letters, numbers, and single hyphens only.')
    }

    const adminEmail = (await prompt.question('Owner email (optional): ')).trim() || null
    if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error('Owner email is not a valid email address.')
    }

    const monthlyBudgetInput = (await prompt.question(`Monthly budget in USD [${DEFAULT_MONTHLY_BUDGET_USD}]: `)).trim()
    const monthlyBudgetUsd = monthlyBudgetInput ? Number(monthlyBudgetInput) : DEFAULT_MONTHLY_BUDGET_USD
    if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd <= 0 || monthlyBudgetUsd > 1_000_000_000) {
      throw new Error('Monthly budget must be a positive number no greater than 1,000,000,000 USD.')
    }

    const confirmation = await prompt.question('Type BOOTSTRAP to create these records in the connected database: ')
    if (confirmation !== 'BOOTSTRAP') {
      console.log('Bootstrap cancelled; no records were created.')
      return
    }

    const ownerUserId = randomUUID()
    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    const monthlyLimitMicros = String(Math.round(monthlyBudgetUsd * 1_000_000))

    await db.transaction(async (tx) => {
      const [existingOrg] = await tx.select({ id: schema.organizations.id })
        .from(schema.organizations)
        .limit(1)
      if (existingOrg) {
        throw new Error('Bootstrap refused: this database already contains an organization. No records were created.')
      }

      const [org] = await tx.insert(schema.organizations).values({
        name: orgName,
        slug: orgSlug,
        plan: 'starter',
        adminEmail,
        modelPolicy: {
          allowed_models: [INITIAL_MODEL],
          max_model_tier: 'high',
          require_classification: true,
          allow_opus: false,
        },
      }).returning({ id: schema.organizations.id })
      if (!org) throw new Error('Failed to create the organization.')

      const [team] = await tx.insert(schema.teams).values({
        orgId: org.id,
        name: 'Owners',
        slug: 'owners',
      }).returning({ id: schema.teams.id })
      if (!team) throw new Error('Failed to create the owner team.')

      await tx.insert(schema.orgMembers).values({
        orgId: org.id,
        userId: ownerUserId,
        role: 'owner',
        email: adminEmail,
      })

      await tx.insert(schema.budgets).values({
        orgId: org.id,
        monthlyLimitMicros,
      })

      await tx.insert(schema.apiKeys).values({
        orgId: org.id,
        teamId: team.id,
        userId: ownerUserId,
        keyHash,
        keyPrefix,
        name: 'Initial owner key',
        scopes: ['proxy'],
      })
    })

    console.log('\nBootstrap complete. Copy this owner API key now; it will not be shown again:\n')
    console.log(rawKey)
    console.log('\nStore it in a password manager. Use it as the dashboard server-side API key.')
  } finally {
    prompt.close()
    await connection.end()
  }
}

run().catch((error: unknown) => {
  console.error('Bootstrap failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
