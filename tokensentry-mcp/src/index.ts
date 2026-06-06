// tokensentry-mcp/src/index.ts
// TokenSentry MCP Server — Claude Code native integration
// Appears as native tools in Claude Code sidebar — no wrapper needed
//
// Install: claude mcp add --npm @tokensentry/mcp
// Configure: export TOKENSENTRY_API_KEY="ts_live_xxx"

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'TokenSentry',
  version: '1.0.0',
  description: 'AI cost governance — budget tracking, prompt optimization, agent guard',
})

const TS_API = process.env['TOKENSENTRY_API_URL'] ?? 'https://api.tokensentry.ai'
const TS_KEY = process.env['TOKENSENTRY_API_KEY'] ?? ''

if (!TS_KEY) {
  process.stderr.write(
    '[TokenSentry MCP] WARNING: TOKENSENTRY_API_KEY not set. Set it via:\n' +
    '  export TOKENSENTRY_API_KEY="ts_live_xxx"\n'
  )
}

const headers = {
  'Authorization': `Bearer ${TS_KEY}`,
  'Content-Type': 'application/json',
}

async function apiCall(path: string, options?: RequestInit) {
  const res = await fetch(`${TS_API}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TokenSentry API error ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

// ── Tool 1: Check Budget ─────────────────────────────────────────────────────
server.tool(
  'ts_check_budget',
  'Check remaining AI budget for this organization. Shows monthly spend, limit, and health status.',
  {},
  async () => {
    const data = await apiCall('/v1/spend/realtime')
    const remaining = (data.monthly_budget_usd ?? 0) - (data.current_month_spend_usd ?? 0)
    const util = data.utilization ?? 0

    let status = '✅  Budget healthy'
    if (util > 0.95) status = '🛑  CRITICAL — Budget at 95%+ — calls may be blocked soon'
    else if (util > 0.80) status = '⚠️   Budget above 80% — consider switching to simpler prompts'
    else if (util > 0.60) status = '🟡  Budget above 60% — monitor usage'

    return {
      content: [{
        type: 'text',
        text: `💰 Budget Status:\n` +
          `  Monthly budget:  $${(data.monthly_budget_usd ?? 0).toFixed(2)}\n` +
          `  Spent so far:    $${(data.current_month_spend_usd ?? 0).toFixed(2)}\n` +
          `  Remaining:       $${remaining.toFixed(2)}\n` +
          `  Utilization:     ${(util * 100).toFixed(1)}%\n` +
          `  ${status}`,
      }],
    }
  }
)

// ── Tool 2: Get Savings Report ───────────────────────────────────────────────
server.tool(
  'ts_get_savings',
  'Get a savings report showing how much TokenSentry has saved via routing optimization and caching.',
  {},
  async () => {
    const data = await apiCall('/v1/analytics/dashboard')
    return {
      content: [{
        type: 'text',
        text: `📊 TokenSentry Savings (last 30 days):\n` +
          `  Calls this month:    ${(data.total_calls ?? 0).toLocaleString()}\n` +
          `  Cache hit rate:      ${((data.cache_hit_rate ?? 0) * 100).toFixed(0)}%\n` +
          `  Avg token reduction: ${(data.avg_reduction_pct ?? 0).toFixed(0)}%\n` +
          `  Total saved:         $${(data.total_saved_usd ?? 0).toFixed(2)}\n` +
          `  Agentic calls:       ${(data.agentic_calls ?? 0).toLocaleString()}`,
      }],
    }
  }
)

// ── Tool 3: Optimize a Prompt ────────────────────────────────────────────────
server.tool(
  'ts_optimize_prompt',
  'Optimize a prompt to reduce token usage before sending to AI. Preserves semantic meaning while cutting 20-55% of tokens.',
  {
    prompt: z.string().min(1).max(50000).describe('The prompt to optimize'),
    priority: z.enum(['accuracy', 'speed', 'cost']).default('cost')
      .describe('Optimization priority: accuracy (min 5% reduction), speed (balanced), cost (max reduction)'),
  },
  async ({ prompt, priority }) => {
    const data = await apiCall('/v1/optimize', {
      method: 'POST',
      body: JSON.stringify({ prompt, preserve_priority: priority }),
    })
    return {
      content: [{
        type: 'text',
        text: `✂️  Prompt Optimization (priority: ${priority}):\n` +
          `  Original tokens:  ~${data.original_token_estimate ?? '?'}\n` +
          `  Optimized tokens: ~${data.optimized_token_estimate ?? '?'}\n` +
          `  Reduction:        ${(data.reduction_percentage ?? 0).toFixed(0)}%\n` +
          `  Integrity score:  ${((data.semantic_integrity_score ?? 1) * 100).toFixed(0)}%\n\n` +
          `Optimized prompt:\n${data.optimized_prompt ?? prompt}`,
      }],
    }
  }
)

// ── Tool 4: Guard an Agentic Task ────────────────────────────────────────────
server.tool(
  'ts_guard_agent',
  'Check if a running agentic task should continue or is approaching budget limits / looping. Call this every 5-10 turns.',
  {
    agent_id: z.string().min(1).describe('Unique ID for this agent session (e.g., randomUUID())'),
    tokens_used: z.number().int().nonnegative().describe('Total tokens consumed so far this session'),
    token_budget: z.number().int().positive().describe('Maximum tokens allowed for this task'),
    turn_count: z.number().int().nonnegative().describe('Number of turns completed so far'),
    task_description: z.string().max(500).describe('Brief description of what the agent is doing'),
    last_response_preview: z.string().max(500).describe('First 500 chars of the most recent response'),
  },
  async (params) => {
    const data = await apiCall(`/v1/agents/${params.agent_id}/check`, {
      method: 'POST',
      body: JSON.stringify({
        token_budget:          params.token_budget,
        total_tokens_consumed: params.tokens_used,
        turn_count:            params.turn_count,
        last_response_text:    params.last_response_preview,
        current_task:          params.task_description,
      }),
    })

    const statusEmoji: Record<string, string> = {
      healthy: '✅', warning: '⚠️', critical: '🔴', terminate: '🛑',
    }
    const emoji = statusEmoji[data.status] ?? '❓'

    return {
      content: [{
        type: 'text',
        text: `${emoji} Agent Status: ${(data.status ?? 'unknown').toUpperCase()}\n` +
          `  Budget used:  ${((data.budget_utilization ?? 0) * 100).toFixed(1)}%\n` +
          `  Action:       ${data.action ?? 'continue'}\n` +
          `  Reason:       ${data.reason ?? ''}\n` +
          (data.intervention_message ? `\n  💬 Instruction: ${data.intervention_message}\n` : '') +
          (data.status === 'terminate' ? '\n  🛑 STOP — Terminate this agent session immediately.' : ''),
      }],
    }
  }
)

// ── Tool 5: Ask Budget Advisor ───────────────────────────────────────────────
server.tool(
  'ts_ask_advisor',
  'Ask the AI budget advisor a natural language question about your AI spending and get actionable recommendations.',
  {
    question: z.string().min(5).max(1000).describe('Natural language question about AI spend (e.g., "Will we exceed budget this month?")'),
  },
  async ({ question }) => {
    const data = await apiCall('/v1/advisor/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    })
    return {
      content: [{ type: 'text', text: data.answer ?? 'No answer returned.' }],
    }
  }
)

// ── Start server ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[TokenSentry MCP] Server started and connected\n')
