// src/emails/budget-alert-80.tsx — Budget 80% alert email (§E5)
import * as React from 'react'

interface BudgetAlert80Props {
  orgName: string
  currentSpend: number
  monthlyLimit: number
  utilizationPct: number
  daysRemaining: number
  dashboardUrl: string
}

export function BudgetAlert80Email({
  orgName, currentSpend, monthlyLimit, utilizationPct, daysRemaining, dashboardUrl,
}: BudgetAlert80Props) {
  const dailyBurn = currentSpend / (30 - daysRemaining || 1)
  const projected = currentSpend + dailyBurn * daysRemaining
  const willExceed = projected > monthlyLimit

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#fffbeb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #f59e0b' }}>
          <div style={{ fontSize: '28px', margin: '0 0 8px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', color: '#92400e', margin: '0 0 16px' }}>
            AI Budget Alert — {orgName}
          </h1>

          <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#92400e', margin: 0 }}>{utilizationPct}%</div>
            <div style={{ color: '#b45309', margin: '4px 0 0', fontSize: '14px' }}>of monthly budget used</div>
          </div>

          <p style={{ color: '#374151', lineHeight: '1.6' }}>
            <strong>${currentSpend.toFixed(2)}</strong> spent of your <strong>${monthlyLimit.toFixed(2)}</strong> monthly limit.
            With <strong>{daysRemaining} days</strong> remaining this month, you're on pace to
            {willExceed
              ? ` spend <strong>$${projected.toFixed(2)}</strong> — exceeding your budget.`
              : ' stay within budget.'}
          </p>

          <div style={{ background: '#fef9c3', borderRadius: '6px', padding: '12px', margin: '16px 0', fontSize: '13px', color: '#713f12' }}>
            <strong>Quick fixes:</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
              <li>Lower your org model tier to Haiku-only temporarily</li>
              <li>Enable aggressive prompt compression</li>
              <li>Review top-spending teams in the dashboard</li>
            </ul>
          </div>

          <a href={dashboardUrl} style={{
            display: 'inline-block', background: '#d97706', color: '#fff',
            padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', marginTop: '16px',
          }}>
            Review &amp; Adjust Budget →
          </a>
        </div>
      </body>
    </html>
  )
}
