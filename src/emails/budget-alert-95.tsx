// src/emails/budget-alert-95.tsx — Budget 95% critical alert email (§E6)
import * as React from 'react'

interface BudgetAlert95Props {
  orgName: string
  currentSpend: number
  monthlyLimit: number
  utilizationPct: number
  daysRemaining: number
  dashboardUrl: string
}

export function BudgetAlert95Email({
  orgName, currentSpend, monthlyLimit, utilizationPct, daysRemaining, dashboardUrl,
}: BudgetAlert95Props) {
  const remaining = monthlyLimit - currentSpend

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#fef2f2', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #dc2626' }}>
          <div style={{ fontSize: '28px', margin: '0 0 8px' }}>🚨</div>
          <h1 style={{ fontSize: '20px', color: '#dc2626', margin: '0 0 16px' }}>
            CRITICAL: AI Budget at 95% — {orgName}
          </h1>

          <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#dc2626', margin: 0 }}>{utilizationPct}%</div>
            <div style={{ color: '#b91c1c', margin: '4px 0 0', fontSize: '14px' }}>of monthly budget consumed</div>
          </div>

          <p style={{ color: '#374151', lineHeight: '1.6' }}>
            <strong>${currentSpend.toFixed(2)}</strong> spent of your <strong>${monthlyLimit.toFixed(2)}</strong> limit.
            Only <strong>${remaining.toFixed(2)}</strong> remaining.
            With <strong>{daysRemaining} days</strong> left in the month, your next AI call may
            <strong> hit the hard limit and be blocked.</strong>
          </p>

          <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '12px', margin: '16px 0', fontSize: '13px', color: '#991b1b', borderLeft: '3px solid #dc2626' }}>
            <strong>Immediate action required:</strong>
            <ol style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
              <li>Increase your monthly budget limit to avoid service interruption</li>
              <li>Or set <code>on_exhaustion: "downgrade"</code> to auto-switch to Haiku</li>
              <li>Review your top-spending teams and pause non-critical workflows</li>
            </ol>
          </div>

          <a href={dashboardUrl} style={{
            display: 'inline-block', background: '#dc2626', color: '#fff',
            padding: '14px 28px', borderRadius: '6px', textDecoration: 'none',
            marginTop: '8px', fontWeight: 700, fontSize: '15px',
          }}>
            Fix This Now →
          </a>

          <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '24px' }}>
            When the limit is hit, all AI calls will be blocked until the next billing cycle or until you increase the limit.
          </p>
        </div>
      </body>
    </html>
  )
}
