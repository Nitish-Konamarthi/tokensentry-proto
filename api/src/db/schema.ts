import {
  pgTable, uuid, text, timestamp, decimal, boolean, char, integer, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, isNull } from 'drizzle-orm'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('starter'),
  adminEmail: text('admin_email'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  modelPolicy: jsonb('model_policy').notNull().default({
    allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
    max_model_tier: 'sonnet',
    require_classification: true,
    allow_opus: false,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
}, (t) => ({
  orgSlugUnique: uniqueIndex('teams_org_slug_unique').on(t.orgId, t.slug),
}))

export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull().default('member'),
  email: text('email'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgUserUnique: uniqueIndex('org_members_org_user_unique').on(t.orgId, t.userId),
}))

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  teamId: uuid('team_id').references(() => teams.id),
  userId: uuid('user_id'),
  keyHash: char('key_hash', { length: 64 }).notNull().unique(),
  keyPrefix: char('key_prefix', { length: 16 }).notNull(),
  name: text('name').notNull(),
  scopes: text('scopes').array().notNull().default(['proxy']),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastUsedIp: text('last_used_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  orgIdIdx: index('api_keys_org_id_idx').on(t.orgId),
  activeHashIdx: index('api_keys_active_hash_idx').on(t.keyHash).where(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    isNull(t.revokedAt),
  ),
}))

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  teamId: uuid('team_id').references(() => teams.id),
  userId: uuid('user_id'),
  monthlyLimitMicros: decimal('monthly_limit_micros', { precision: 16, scale: 4 }).notNull(),
  dailyLimitMicros: decimal('daily_limit_micros', { precision: 16, scale: 4 }),
  alertAt80Pct: boolean('alert_at_80_pct').default(true),
  alertAt95Pct: boolean('alert_at_95_pct').default(true),
  onExhaustion: text('on_exhaustion').default('block'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  userId: uuid('user_id'),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  callId: text('call_id').notNull(),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costMicros: integer('cost_micros').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  cacheHit: boolean('cache_hit').notNull().default(false),
  streamed: boolean('streamed').notNull().default(false),
  statusCode: integer('status_code').notNull().default(200),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgCreatedIdx: index('usage_logs_org_created_idx').on(t.orgId, t.createdAt),
  modelIdx: index('usage_logs_model_idx').on(t.orgId, t.model),
  providerIdx: index('usage_logs_provider_idx').on(t.orgId, t.provider),
}))

export const routingLogs = pgTable('routing_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  callId: text('call_id').notNull(),
  requestedModel: text('requested_model').notNull(),
  recommendedModel: text('recommended_model'),
  approvedModel: text('approved_model').notNull(),
  complexity: text('complexity'),
  confidence: decimal('confidence', { precision: 4, scale: 3 }),
  reasoning: text('reasoning'),
  estimatedCostUsd: decimal('estimated_cost_usd', { precision: 12, scale: 6 }),
  overridden: boolean('overridden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgIdx: index('routing_logs_org_idx').on(t.orgId, t.createdAt),
}))

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  details: jsonb('details'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgActionIdx: index('audit_logs_org_action_idx').on(t.orgId, t.createdAt),
}))

export const providerHealth = pgTable('provider_health', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull().unique(),
  status: text('status').notNull().default('healthy'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).defaultNow(),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  errorCount: integer('error_count').notNull().default(0),
  avgLatencyMs: integer('avg_latency_ms'),
})

export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  sessionId: text('session_id').notNull().unique(),
  status: text('status').notNull().default('active'),
  turnCount: integer('turn_count').notNull().default(0),
  tokensConsumed: integer('tokens_consumed').notNull().default(0),
  tokenBudget: integer('token_budget').notNull().default(100000),
  loopDetected: boolean('loop_detected').notNull().default(false),
  riskScore: integer('risk_score'),
  lastAction: text('last_action'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  terminatedAt: timestamp('terminated_at', { withTimezone: true }),
}, (t) => ({
  orgAgentIdx: index('agent_sessions_org_agent_idx').on(t.orgId, t.agentId),
  sessionStatusIdx: index('agent_sessions_status_idx').on(t.status),
}))

export const agentGuardEvents = pgTable('agent_guard_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  agentId: text('agent_id').notNull(),
  score: integer('score').notNull(),
  action: text('action').notNull(),
  factors: jsonb('factors').notNull().default([]),
  callId: text('call_id'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgCreatedIdx: index('agent_guard_events_org_created_idx').on(t.orgId, t.createdAt),
}))

// ── Relations ──

export const organizationsRelations = relations(organizations, ({ many }) => ({
  teams: many(teams),
  members: many(orgMembers),
  apiKeys: many(apiKeys),
  budgets: many(budgets),
  usageLogs: many(usageLogs),
  auditLogs: many(auditLogs),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, { fields: [teams.orgId], references: [organizations.id] }),
  apiKeys: many(apiKeys),
  budgets: many(budgets),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, { fields: [apiKeys.orgId], references: [organizations.id] }),
  team: one(teams, { fields: [apiKeys.teamId], references: [teams.id] }),
}))

export const budgetsRelations = relations(budgets, ({ one }) => ({
  organization: one(organizations, { fields: [budgets.orgId], references: [organizations.id] }),
  team: one(teams, { fields: [budgets.teamId], references: [teams.id] }),
}))
