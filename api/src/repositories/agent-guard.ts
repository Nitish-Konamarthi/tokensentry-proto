import { db } from '../db/index.js'
import { agentSessions, agentGuardEvents } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'

export interface AgentSessionRow {
  id: string
  orgId: string
  agentId: string
  sessionId: string
  status: string
  turnCount: number
  tokensConsumed: number
  tokenBudget: number
  loopDetected: boolean
  riskScore: number | null
  lastAction: string | null
  startedAt: Date
  terminatedAt: Date | null
}

export interface GuardEventRow {
  id: string
  orgId: string
  sessionId: string
  agentId: string
  score: number
  action: string
  factors: unknown
  callId: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: Date
}

export class AgentGuardRepository {
  async upsertSession(data: {
    orgId: string
    agentId: string
    sessionId: string
    turnCount: number
    tokensConsumed: number
    riskScore: number
    action: 'allow' | 'warn' | 'block'
  }): Promise<AgentSessionRow> {
    const existing = await db.select({ id: agentSessions.id })
      .from(agentSessions)
      .where(eq(agentSessions.sessionId, data.sessionId))
      .limit(1)

    if (existing[0]) {
      const rows = await db.update(agentSessions)
        .set({
          turnCount: data.turnCount,
          tokensConsumed: data.tokensConsumed,
          riskScore: data.riskScore,
          lastAction: data.action,
          status: data.action === 'block' ? 'terminated' : undefined,
          terminatedAt: data.action === 'block' ? new Date() : undefined,
        })
        .where(eq(agentSessions.id, existing[0].id))
        .returning()
      return rows[0] as unknown as AgentSessionRow
    }

    const rows = await db.insert(agentSessions).values({
      orgId: data.orgId,
      agentId: data.agentId,
      sessionId: data.sessionId,
      turnCount: data.turnCount,
      tokensConsumed: data.tokensConsumed,
      tokenBudget: 100000,
      riskScore: data.riskScore,
      lastAction: data.action,
      loopDetected: data.riskScore > 70,
      status: data.action === 'block' ? 'terminated' : 'active',
    }).returning()
    return rows[0] as unknown as AgentSessionRow
  }

  async recordGuardEvent(data: {
    orgId: string
    sessionId: string
    agentId: string
    score: number
    action: string
    factors: unknown
    callId?: string
    inputTokens?: number
    outputTokens?: number
  }): Promise<GuardEventRow> {
    const rows = await db.insert(agentGuardEvents).values(data).returning()
    return rows[0] as unknown as GuardEventRow
  }

  async getActiveSessions(orgId: string, limit = 50): Promise<AgentSessionRow[]> {
    const rows = await db.select().from(agentSessions)
      .where(and(
        eq(agentSessions.orgId, orgId),
        eq(agentSessions.status, 'active'),
      ))
      .orderBy(desc(agentSessions.startedAt))
      .limit(limit)
    return rows as unknown as AgentSessionRow[]
  }

  async getGuardEvents(orgId: string, limit = 100): Promise<GuardEventRow[]> {
    const rows = await db.select().from(agentGuardEvents)
      .where(eq(agentGuardEvents.orgId, orgId))
      .orderBy(desc(agentGuardEvents.createdAt))
      .limit(limit)
    return rows as unknown as GuardEventRow[]
  }

  async getBlockedSessions(orgId: string): Promise<AgentSessionRow[]> {
    const rows = await db.select().from(agentSessions)
      .where(and(
        eq(agentSessions.orgId, orgId),
        eq(agentSessions.status, 'terminated'),
      ))
      .orderBy(desc(agentSessions.terminatedAt))
      .limit(20)
    return rows as unknown as AgentSessionRow[]
  }
}

export const agentGuardRepo = new AgentGuardRepository()
