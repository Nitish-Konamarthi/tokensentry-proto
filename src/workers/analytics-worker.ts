// src/workers/analytics-worker.ts — BullMQ → ClickHouse ingestion (§C3)
// Run as separate process: node dist/workers/analytics-worker.js
// Batches AI call events: flush every 100ms OR when batch hits 1000 events

import '../instrumentation.js'   // OTel must be first
import { Worker } from 'bullmq'
import { insertCallEvent, type AICallEvent } from '../clients/clickhouse.js'
import { logger } from '../utils/logger.js'

// BullMQ bundles its own ioredis — pass URL, not our redis instance
const bullmqConnection = { url: process.env['REDIS_URL']! }

const FLUSH_INTERVAL_MS = 100
const BATCH_SIZE = 1000

let batch: AICallEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushBatch(): Promise<void> {
  if (batch.length === 0) return
  const toFlush = [...batch]
  batch = []

  try {
    // Batch insert all events in one ClickHouse request
    await Promise.all(toFlush.map(e => insertCallEvent(e)))
    logger.info({ count: toFlush.length }, 'ClickHouse batch inserted')
  } catch (err) {
    logger.error({ err, count: toFlush.length }, 'ClickHouse batch insert failed — requeueing')
    // Put events back for retry
    batch = [...toFlush, ...batch]
  }
}

const analyticsWorker = new Worker(
  'analytics',
  async (job) => {
    if (job.name === 'ai_call_event') {
      batch.push(job.data as AICallEvent)

      if (batch.length >= BATCH_SIZE) {
        // Flush immediately on large batch
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
        await flushBatch()
      } else if (!flushTimer) {
        // Schedule flush in 100ms if not already scheduled
        flushTimer = setTimeout(async () => {
          flushTimer = null
          await flushBatch()
        }, FLUSH_INTERVAL_MS)
      }
    }

    if (job.name === 'agent_terminated') {
      // Agent termination events are high priority — log immediately
      logger.warn({
        agentId: (job.data as Record<string, unknown>)['agentId'],
        orgId: (job.data as Record<string, unknown>)['orgId'],
        reason: (job.data as Record<string, unknown>)['reason'],
        tokensConsumed: (job.data as Record<string, unknown>)['tokensConsumed'],
      }, 'Agent terminated event processed')
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 50,
    limiter: { max: 2000, duration: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  }
)

analyticsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Analytics worker job failed')
})

analyticsWorker.on('error', (err) => {
  logger.error({ err }, 'Analytics worker error')
})

// Flush remaining events on graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Analytics worker: SIGTERM received, flushing batch...')
  await flushBatch()
  await analyticsWorker.close()
  logger.info('Analytics worker: shutdown complete')
  process.exit(0)
})

process.on('SIGINT', async () => {
  await flushBatch()
  await analyticsWorker.close()
  process.exit(0)
})

logger.info({ batchSize: BATCH_SIZE, flushIntervalMs: FLUSH_INTERVAL_MS }, 'Analytics worker started')
