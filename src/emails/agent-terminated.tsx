// src/emails/agent-terminated.tsx — Agent termination alert email (§E7)
import * as React from 'react'

interface AgentTerminatedProps {
  agentId: string
  reason: string
  tokensConsumed: number
  loopDetected: boolean
  dashboardUrl: string
}

export function AgentTerminatedEmail({
  agentId, reason, tokensConsumed, loopDetected, dashboardUrl,
}: AgentTerminatedProps) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #dc2626' }}>
          <div style={{ fontSize: '28px', margin: 0 }}>🛑</div>
          <h1 style={{ fontSize: '20px', color: '#dc2626' }}>AI Agent Stopped by TokenSentry</h1>

          <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '16px', margin: '16px 0', fontSize: '13px', color: '#991b1b' }}>
            <strong>Agent ID:</strong>{' '}
            <code style={{ fontFamily: 'monospace', background: 'none' }}>{agentId}</code>
            <br />
            <strong>Tokens consumed:</strong> {tokensConsumed.toLocaleString()}
            <br />
            <strong>Reason:</strong> {reason}
            <br />
            <strong>Loop detected:</strong>{' '}
            {loopDetected ? 'Yes — agent was repeating the same steps' : 'No — budget limit reached'}
          </div>

          <p style={{ color: '#374151', lineHeight: '1.6' }}>
            TokenSentry's Agentic Guard terminated this session before it could exhaust your budget further.
            {loopDetected && ' The agent appeared to be stuck in an infinite loop.'}
          </p>

          <p style={{ fontWeight: 'bold', color: '#111', marginBottom: '8px' }}>Quick fix:</p>
          <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
            <code style={{ fontFamily: 'monospace', fontSize: '12px', color: '#374151' }}>
              {`// Add agent budget header to your API calls:\nheaders: { "X-TS-Agent-Budget-Tokens": "50000" }`}
            </code>
          </div>

          <p style={{ color: '#555', fontSize: '13px', lineHeight: '1.6' }}>
            This tells TokenSentry the maximum token budget for this agent session.
            The Agentic Guard will automatically compress context and warn before the limit is hit.
          </p>

          <a href={dashboardUrl} style={{
            display: 'inline-block', background: '#111', color: '#fff',
            padding: '12px 24px', borderRadius: '6px', textDecoration: 'none',
          }}>
            View Agent Log →
          </a>
        </div>
      </body>
    </html>
  )
}
