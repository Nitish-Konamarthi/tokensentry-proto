// src/emails/day1-nudge.tsx — Day 1 nudge (no calls yet) (§E2)
import * as React from 'react'

interface Day1NudgeProps {
  firstName: string
  apiKey: string
}

export function Day1NudgeEmail({ firstName, apiKey }: Day1NudgeProps) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h1 style={{ fontSize: '20px', color: '#111' }}>Still getting set up, {firstName}?</h1>
          <p style={{ color: '#555', lineHeight: '1.6' }}>
            You signed up yesterday but we haven't seen any calls yet.
            Here's the fastest 60-second test:
          </p>
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', margin: '20px 0' }}>
            <code style={{ color: '#a6e3a1', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre' }}>
{`curl -X POST https://api.tokensentry.ai/v1/proxy/messages \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-opus-4-6","max_tokens":20,
       "messages":[{"role":"user","content":"Hi"}]}'`}
            </code>
          </div>
          <p style={{ color: '#555' }}>
            Check the response headers. You'll see{' '}
            <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px' }}>X-TS-Approved-Model: claude-haiku-4-5</code>.
            {' '}That's TokenSentry routing your Opus request to Haiku — saving you 94%.
          </p>
          <a href="https://docs.tokensentry.ai/quickstart" style={{
            display: 'inline-block', background: '#4f46e5', color: '#fff',
            padding: '10px 20px', borderRadius: '6px', textDecoration: 'none', marginTop: '16px',
          }}>
            Full Integration Guide →
          </a>
        </div>
      </body>
    </html>
  )
}
