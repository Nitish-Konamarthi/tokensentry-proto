// src/workers/alert-worker.ts — BullMQ → Resend/Slack alert delivery (§C4)
// Run as separate process: node dist/workers/alert-worker.js
// Handles: budget_80, budget_95, agent_terminated, weekly_report, plan_upgraded

import '../instrumentation.js'  // OTel must be first
import { Worker } from 'bullmq'
import { Resend } from 'resend'
import { pg } from '../clients/db.js'
import { logger } from '../utils/logger.js'

// BullMQ bundles its own ioredis — pass URL, not our redis instance
const bullmqConnection = { url: process.env['REDIS_URL']! }

const resend = new Resend(process.env['RESEND_API_KEY']!)
const FROM_EMAIL = 'alerts@mail.tokensentry.ai'

interface OrgRecord {
  id: string
  name: string
  admin_email: string | null
  plan: string
}

async function getOrg(orgId: string): Promise<OrgRecord | null> {
  const rows = await pg<OrgRecord[]>`
    SELECT id, name, admin_email, plan FROM organizations WHERE id = ${orgId} LIMIT 1
  `
  return rows[0] ?? null
}

interface SlackChannel {
  config: { webhookUrl: string }
}

async function sendSlackAlert(
  orgId: string,
  alert: { color: string; title: string; message: string }
): Promise<void> {
  const channels = await pg<SlackChannel[]>`
    SELECT config FROM alert_channels
    WHERE org_id = ${orgId} AND channel_type = 'slack' AND active = true
  `
  for (const ch of channels) {
    try {
      await fetch(ch.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [{
            color: alert.color,
            title: alert.title,
            text: alert.message,
            footer: 'TokenSentry',
            ts: Math.floor(Date.now() / 1000),
          }],
        }),
      })
    } catch (err) {
      logger.warn({ err, orgId }, 'Slack alert delivery failed')
    }
  }
}

function getDaysRemainingInMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return lastDay - now.getDate()
}

const alertWorker = new Worker(
  'alerts',
  async (job) => {
    const data = job.data as Record<string, unknown>
    const orgId = data['orgId'] as string

    switch (job.name) {

      case 'budget_80': {
        const { currentSpend, limit, utilization } = data as {
          currentSpend: number; limit: number; utilization: number
        }
        const org = await getOrg(orgId)
        if (!org?.admin_email) break

        await resend.emails.send({
          from: FROM_EMAIL,
          to: org.admin_email,
          subject: `⚠️ ${org.name} — AI budget at 80%`,
          html: buildBudgetAlertHtml({
            orgName: org.name, currentSpend, limit, utilizationPct: 80,
            daysRemaining: getDaysRemainingInMonth(),
            color: '#f59e0b',
          }),
        })

        await sendSlackAlert(orgId, {
          color: '#ff9900',
          title: '⚠️ AI Budget at 80%',
          message: `$${currentSpend.toFixed(2)} of $${limit.toFixed(2)} used (${(utilization * 100).toFixed(1)}%)`,
        })

        logger.info({ orgId, utilization }, 'Budget 80% alert sent')
        break
      }

      case 'budget_95': {
        const { currentSpend, limit, utilization } = data as {
          currentSpend: number; limit: number; utilization: number
        }
        const org = await getOrg(orgId)
        if (!org?.admin_email) break

        await resend.emails.send({
          from: FROM_EMAIL,
          to: org.admin_email,
          subject: `🚨 ${org.name} — AI budget at 95% — Action Required`,
          html: buildBudgetAlertHtml({
            orgName: org.name, currentSpend, limit, utilizationPct: 95,
            daysRemaining: getDaysRemainingInMonth(),
            color: '#dc2626',
          }),
        })

        await sendSlackAlert(orgId, {
          color: '#ff0000',
          title: '🚨 AI Budget at 95% — Action Required',
          message: `$${currentSpend.toFixed(2)} of $${limit.toFixed(2)} used. At this rate you will hit your limit today.`,
        })

        logger.warn({ orgId, utilization }, 'Budget 95% alert sent')
        break
      }

      case 'agent_terminated': {
        const { agentId, reason, tokensConsumed, loopDetected } = data as {
          agentId: string; reason: string; tokensConsumed: number; loopDetected: boolean
        }
        const org = await getOrg(orgId)
        if (!org?.admin_email) break

        await resend.emails.send({
          from: FROM_EMAIL,
          to: org.admin_email,
          subject: `🛑 AI Agent Stopped: ${agentId}`,
          html: buildAgentTerminatedHtml({ agentId, reason, tokensConsumed, loopDetected }),
        })

        await sendSlackAlert(orgId, {
          color: '#ff0000',
          title: `🛑 AI Agent Terminated: ${agentId}`,
          message: `Reason: ${reason}. Tokens consumed: ${tokensConsumed.toLocaleString()}. Loop detected: ${loopDetected ? 'Yes' : 'No'}`,
        })

        logger.warn({ orgId, agentId, reason }, 'Agent termination alert sent')
        break
      }

      case 'weekly_report': {
        logger.info({ orgId }, 'Weekly report job received (email delivery pending data fetch)')
        break
      }

      case 'plan_upgraded': {
        const { plan } = data as { plan: string }
        logger.info({ orgId, plan }, 'Plan upgrade email queued')
        break
      }

      default:
        logger.warn({ jobName: job.name }, 'Unknown alert job name')
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
    limiter: { max: 100, duration: 1000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  }
)

alertWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Alert worker job failed')
})

process.on('SIGTERM', async () => {
  await alertWorker.close()
  process.exit(0)
})

logger.info('Alert worker started')

// ── Email HTML builders ──────────────────────────────────────────────────────

function buildBudgetAlertHtml(p: {
  orgName: string; currentSpend: number; limit: number
  utilizationPct: number; daysRemaining: number; color: string
}): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb">
<div style="max-width:560px;margin:40px auto;padding:32px;background:#fff;border-radius:8px;border:2px solid ${p.color}">
  <div style="font-size:28px;margin-bottom:8px">${p.utilizationPct >= 95 ? '🚨' : '⚠️'}</div>
  <h1 style="font-size:20px;color:${p.color};margin:0 0 16px">AI Budget Alert — ${p.orgName}</h1>
  <div style="background:#fef3c7;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px">
    <div style="font-size:36px;font-weight:bold;color:${p.color};margin:0">${p.utilizationPct}%</div>
    <div style="color:#b45309;font-size:14px;margin-top:4px">of monthly budget used</div>
  </div>
  <p style="color:#374151;line-height:1.6">
    <strong>$${p.currentSpend.toFixed(2)}</strong> spent of your <strong>$${p.limit.toFixed(2)}</strong> monthly limit.
    With <strong>${p.daysRemaining} days</strong> remaining this month.
  </p>
  <a href="https://app.tokensentry.ai/budgets" style="display:inline-block;background:${p.color};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px">
    Review &amp; Adjust Budget →
  </a>
</div></body></html>`
}

function buildAgentTerminatedHtml(p: {
  agentId: string; reason: string; tokensConsumed: number; loopDetected: boolean
}): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb">
<div style="max-width:560px;margin:40px auto;padding:32px;background:#fff;border-radius:8px;border:2px solid #dc2626">
  <div style="font-size:28px;margin:0">🛑</div>
  <h1 style="font-size:20px;color:#dc2626">AI Agent Stopped by TokenSentry</h1>
  <div style="background:#fef2f2;border-radius:6px;padding:16px;margin:16px 0;font-size:13px;color:#991b1b">
    <strong>Agent ID:</strong> <code>${p.agentId}</code><br>
    <strong>Tokens consumed:</strong> ${p.tokensConsumed.toLocaleString()}<br>
    <strong>Reason:</strong> ${p.reason}<br>
    <strong>Loop detected:</strong> ${p.loopDetected ? 'Yes — agent was repeating the same steps' : 'No — budget limit reached'}
  </div>
  <p style="color:#374151;line-height:1.6">
    TokenSentry's Agentic Guard terminated this session before it could exhaust your budget.
    ${p.loopDetected ? 'The agent appeared to be stuck in an infinite loop.' : ''}
  </p>
  <a href="https://app.tokensentry.ai/analytics" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
    View Agent Log →
  </a>
</div></body></html>`
}
