import { db } from '../db/index.js'
import { organizations, teams, orgMembers } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

export class OrgRepository {
  async findById(id: string) {
    const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
    return rows[0] ?? null
  }

  async findBySlug(slug: string) {
    const rows = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
    return rows[0] ?? null
  }

  async create(data: { name: string; slug: string; plan?: string; adminEmail?: string }) {
    const rows = await db.insert(organizations).values(data).returning()
    return rows[0]!
  }

  async updatePolicy(id: string, policy: Record<string, unknown>) {
    const rows = await db.update(organizations)
      .set({ modelPolicy: policy, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()
    return rows[0] ?? null
  }

  async findTeams(orgId: string) {
    return db.select().from(teams).where(eq(teams.orgId, orgId))
  }

  async createTeam(data: { orgId: string; name: string; slug: string }) {
    const rows = await db.insert(teams).values(data).returning()
    return rows[0]!
  }

  async findMembers(orgId: string) {
    return db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId))
  }

  async addMember(data: { orgId: string; userId: string; role: string; email?: string }) {
    const rows = await db.insert(orgMembers).values(data).returning()
    return rows[0]!
  }

  async updateStripeCustomerId(id: string, stripeCustomerId: string) {
    const rows = await db.update(organizations)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()
    return rows[0] ?? null
  }

  async updatePlan(id: string, plan: string) {
    const rows = await db.update(organizations)
      .set({ plan, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()
    return rows[0] ?? null
  }

  async removeMember(orgId: string, memberId: string) {
    const rows = await db.delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.id, memberId)))
      .returning()
    return rows[0] ?? null
  }

  async updateName(id: string, name: string) {
    const rows = await db.update(organizations)
      .set({ name, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning()
    return rows[0] ?? null
  }
}

export const orgRepo = new OrgRepository()
