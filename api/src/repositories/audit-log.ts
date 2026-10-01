import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { and, desc, eq, like } from 'drizzle-orm'

export class AuditLogRepository {
  async insert(data: {
    orgId: string; actorId?: string
    action: string; resource: string
    details?: Record<string, unknown>; ip?: string
  }) {
    const rows = await db.insert(auditLogs).values(data).returning()
    return rows[0]!
  }

  async findByOrg(orgId: string, limit = 50) {
    return db.select()
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
  }

  async findFiltered(orgId: string, actionPrefix: string, limit = 50) {
    return db.select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), like(auditLogs.action, `${actionPrefix}%`)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
  }
}

export const auditLogRepo = new AuditLogRepository()
