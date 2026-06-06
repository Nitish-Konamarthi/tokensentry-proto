// src/emails/welcome.tsx — Welcome email (Day 0 onboarding)
// Sent immediately after signup

import * as React from 'react'

interface WelcomeEmailProps {
  firstName: string
  apiKey: string
  orgName: string
}

export function WelcomeEmail({ firstName, apiKey, orgName }: WelcomeEmailProps) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🛡️</div>
            <div style={{ color: '#6366f1', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' }}>TOKENSENTRY</div>
          </div>

          <h1 style={{ fontSize: '22px', color: '#111', marginTop: 0 }}>
            Welcome, {firstName}. Your AI costs just got a watchdog.
          </h1>

          <p style={{ color: '#555', lineHeight: '1.7' }}>
            <strong>{orgName}</strong> is now on TokenSentry. Every AI call you make will be
            automatically routed to the cheapest capable model, with your prompt optimized
            before it reaches the API.
          </p>

          {/* API Key box */}
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '16px', margin: '24px 0' }}>
            <div style={{ color: '#a5b4fc', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>YOUR API KEY (save this — shown once)</div>
            <code style={{ color: '#a6e3a1', fontSize: '13px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {apiKey}
            </code>
          </div>

          {/* Code snippet */}
          <p style={{ color: '#555', lineHeight: '1.7' }}>
            Change one line in your code:
          </p>
          <div style={{ background: '#0d1117', borderRadius: '8px', padding: '16px', margin: '16px 0', fontSize: '13px', fontFamily: 'monospace' }}>
            <div style={{ color: '#f85149', marginBottom: '4px' }}>- apiKey: process.env.ANTHROPIC_API_KEY</div>
            <div style={{ color: '#56d364' }}>+ apiKey: process.env.TOKENSENTRY_KEY,</div>
            <div style={{ color: '#56d364' }}>+ baseURL: "https://api.tokensentry.ai/v1/proxy"</div>
          </div>

          <a href="https://docs.tokensentry.ai/quickstart" style={{
            display: 'inline-block', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', padding: '12px 28px', borderRadius: '6px',
            textDecoration: 'none', fontWeight: 600, marginTop: '16px',
          }}>
            View Full Quickstart →
          </a>

          <hr style={{ borderColor: '#e5e7eb', margin: '28px 0' }} />

          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
            TokenSentry · <a href="https://tokensentry.ai" style={{ color: '#6366f1' }}>tokensentry.ai</a> ·
            {' '}<a href="https://app.tokensentry.ai/settings/notifications" style={{ color: '#6366f1' }}>Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
  )
}
