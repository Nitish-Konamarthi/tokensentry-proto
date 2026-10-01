import { db } from '../db/index.js'
import { apiKeys } from '../db/schema.js'
import { eq, and, isNull, or, sql } from 'drizzle-orm'

export class ApiKeyRepository {
  async findByHash(keyHash: string) {
    const rows = await db.select().from(apiKeys)
      .where(and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(
          isNull(apiKeys.expiresAt),
          sql`${apiKeys.expiresAt} > NOW()`,
        ),
      ))
      .limit(1)
    return rows[0] ?? null
  }

  async findByOrg(orgId: string) {
    return db.select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    }).from(apiKeys)
      .where(eq(apiKeys.orgId, orgId))
      .orderBy(apiKeys.createdAt)
  }

  async create(data: {
    orgId: string
    teamId?: string
    userId?: string
    keyHash: string
    keyPrefix: string
    name: string
    scopes?: string[]
    expiresAt?: Date
  }) {
    const rows = await db.insert(apiKeys).values({
      ...data,
      scopes: data.scopes ?? ['proxy'],
    }).returning()
    return rows[0]!
  }

  async revoke(id: string) {
    const rows = await db.update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning()
    return rows[0] ?? null
  }

  async touchLastUsed(id: string, ip: string) {
    await db.update(apiKeys)
      .set({ lastUsedAt: new Date(), lastUsedIp: ip })
      .where(eq(apiKeys.id, id))
  }
}

export const apiKeyRepo = new ApiKeyRepository()
