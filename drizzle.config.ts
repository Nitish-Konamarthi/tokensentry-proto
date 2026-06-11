import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './sql/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config
