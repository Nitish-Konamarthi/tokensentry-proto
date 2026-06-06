// src/queues/index.ts — BullMQ queue definitions
// All queues defined in one place — workers import from here

import { Queue } from 'bullmq'

// BullMQ bundles its own ioredis — pass connection URL, not our redis instance
const connection = { url: process.env['REDIS_URL']! }

// Analytics queue — high throughput, 50 concurrent workers
// Batches AI call events to ClickHouse every 100ms or 1000 events
export const analyticsQueue = new Queue('analytics', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
})

// Alerts queue — lower throughput, email + Slack delivery
// Handles: budget_80, budget_95, agent_terminated, weekly_report, plan_upgraded
export const alertsQueue = new Queue('alerts', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
})

// Enqueue helpers — typed wrappers for type-safe job dispatch
export async function enqueueAlert(
  jobName: string,
  data: Record<string, unknown>,
  priority = 5
): Promise<void> {
  await alertsQueue.add(jobName, data, { priority })
}

export async function enqueueAnalyticsEvent(
  data: Record<string, unknown>
): Promise<void> {
  await analyticsQueue.add('ai_call_event', data)
}
