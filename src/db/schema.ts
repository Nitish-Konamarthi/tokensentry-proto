// src/db/schema.ts — Drizzle ORM schema (§D1)
// TypeScript-first schema definition for all PostgreSQL tables

import {
  pgTable, uuid, text, timestamp, decimal, boolean,
  jsonb, char, integer, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Organizations ─────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id:               uuid('id').primaryKey().defaultRandom(),
  name:             text('name').notNull(),
  slug:             text('slug').notNull().unique(),
  plan:             text('plan').notNull().default('starter'),
  adminEmail:       text('admin_email'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  anthropicKeyRef:  text('anthropic_key_ref'),   // Supabase Vault ref
  openaiKeyRef:     text('openai_key_ref'),
  modelPolicy:      jsonb('model_policy').notNull().default({
    allowed_models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
    max_model_tier: 'sonnet',
    require_classification: true,
    allow_opus: false,
  }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── Teams ─────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id:     uuid('id').primaryKey().defaultRandom(),
  orgId:  uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:   text('name').notNull(),
  slug:   text('slug').notNull(),
}, (t) => ({
  orgSlugUnique: uniqueIndex('teams_org_slug_unique').on(t.orgId, t.slug),
}))

// ── Org Members ───────────────────────────────────────────────────
export const orgMembers = pgTable('org_members', {
  id:     uuid('id').primaryKey().defaultRandom(),
  orgId:  uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  role:   text('role').notNull().default('member'),
  email:  text('email'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  orgUserUnique: uniqueIndex('org_members_org_user_unique').on(t.orgId, t.userId),
}))

// ── Budget Policies ───────────────────────────────────────────────
export const budgetPolicies = pgTable('budget_policies', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  orgId:                 uuid('org_id').notNull().references(() => organizations.id),
  teamId:                uuid('team_id').references(() => teams.id),
  userId:                uuid('user_id'),
  monthlyLimitUsd:       decimal('monthly_limit_usd', { precision: 12, scale: 4 }).notNull(),
  teamMonthlyLimitUsd:   decimal('team_monthly_limit_usd', { precision: 12, scale: 4 }),
  userDailyLimitUsd:     decimal('user_daily_limit_usd',   { precision: 12, scale: 4 }),
  alertAt80Pct:          boolean('alert_at_80_pct').default(true),
  alertAt95Pct:          boolean('alert_at_95_pct').default(true),
  onExhaustion:          text('on_exhaustion').default('block'),
  downgradeToModel:      text('downgrade_to_model').default('claude-haiku-4-5'),
  modelPolicyOverride:   jsonb('model_policy_override'),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── API Keys ──────────────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id:         uuid('id').primaryKey().defaultRandom(),
  orgId:      uuid('org_id').notNull().references(() => organizations.id),
  teamId:     uuid('team_id').references(() => teams.id),
  userId:     uuid('user_id'),
  keyHash:    char('key_hash', { length: 64 }).notNull().unique(),
  keyPrefix:  char('key_prefix', { length: 12 }).notNull(),
  name:       text('name').notNull(),
  scopes:     text('scopes').array().notNull().default(['ai:proxy']),
  expiresAt:  timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastUsedIp: text('last_used_ip'),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt:  timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  orgIdIdx: index('api_keys_org_id_idx').on(t.orgId),
}))

// ── Alert Channels ────────────────────────────────────────────────
export const alertChannels = pgTable('alert_channels', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').notNull().references(() => organizations.id),
  channelType: text('channel_type').notNull(),   // 'slack' | 'email' | 'webhook'
  config:      jsonb('config').notNull(),         // { webhookUrl } for Slack, { email } for email
  events:      text('events').array().notNull().default([
    'budget_80', 'budget_95', 'budget_exceeded', 'agent_terminated'
  ]),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Agent Sessions ────────────────────────────────────────────────
export const agentSessions = pgTable('agent_sessions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  orgId:            uuid('org_id').notNull().references(() => organizations.id),
  teamId:           uuid('team_id'),
  userId:           uuid('user_id'),
  agentId:          text('agent_id').notNull().unique(),
  taskDescription:  text('task_description'),
  tokenBudget:      integer('token_budget').notNull(),
  tokensConsumed:   integer('tokens_consumed').notNull().default(0),
  turnCount:        integer('turn_count').notNull().default(0),
  status:           text('status').notNull().default('active'),   // 'active' | 'completed' | 'terminated'
  terminationReason: text('termination_reason'),
  loopDetected:     boolean('loop_detected').default(false),
  startedAt:        timestamp('started_at', { withTimezone: true }).defaultNow(),
  terminatedAt:     timestamp('terminated_at', { withTimezone: true }),
})

// ── Semantic Cache ────────────────────────────────────────────────
// Uses pgvector for cosine similarity search
// CREATE EXTENSION IF NOT EXISTS vector; must run first
export const semanticCache = pgTable('semantic_cache', {
  id:            uuid('id').primaryKey().defaultRandom(),
  orgId:         uuid('org_id').notNull().references(() => organizations.id),
  promptHash:    char('prompt_hash', { length: 64 }).notNull(),
  promptPreview: text('prompt_preview'),
  response:      text('response'),
  modelUsed:     text('model_used'),
  inputTokens:   integer('input_tokens'),
  outputTokens:  integer('output_tokens'),
  hitCount:      integer('hit_count').notNull().default(0),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastHitAt:     timestamp('last_hit_at', { withTimezone: true }),
}, (t) => ({
  orgPromptHashUnique: uniqueIndex('semantic_cache_org_prompt_unique').on(t.orgId, t.promptHash),
}))

// ── Relations ─────────────────────────────────────────────────────
export const organizationsRelations = relations(organizations, ({ many }) => ({
  teams:          many(teams),
  budgetPolicies: many(budgetPolicies),
  apiKeys:        many(apiKeys),
  alertChannels:  many(alertChannels),
  members:        many(orgMembers),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization:   one(organizations, { fields: [teams.orgId], references: [organizations.id] }),
  budgetPolicies: many(budgetPolicies),
  apiKeys:        many(apiKeys),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, { fields: [apiKeys.orgId], references: [organizations.id] }),
  team:         one(teams,         { fields: [apiKeys.teamId], references: [teams.id] }),
}))
