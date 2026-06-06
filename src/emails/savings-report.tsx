// src/emails/savings-report.tsx — Day 3 savings report (§E3)
import * as React from 'react'

interface SavingsReportProps {
  firstName: string
  orgName: string
  totalSaved: number
  totalCalls: number
  cacheHitRate: number
  routingEfficiency: number
  topSaving: { description: string; saved: number }
}

export function SavingsReportEmail({
  firstName, orgName, totalSaved, totalCalls, cacheHitRate, routingEfficiency, topSaving,
}: SavingsReportProps) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '40px', fontWeight: 800, color: '#10b981' }}>
              ${totalSaved.toFixed(2)}
            </div>
            <div style={{ color: '#555', fontSize: '16px' }}>saved in your first 3 days</div>
          </div>

          <h1 style={{ fontSize: '18px', color: '#111', textAlign: 'center' }}>
            Nice work, {firstName}. Here's how {orgName} is saving on AI.
          </h1>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '16px', margin: '24px 0' }}>
            {[
              { value: totalCalls.toLocaleString(), label: 'API calls proxied' },
              { value: `${(cacheHitRate * 100).toFixed(0)}%`, label: 'cache hit rate' },
              { value: `${(routingEfficiency * 100).toFixed(0)}%`, label: 'calls rerouted cheaper' },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, textAlign: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#6366f1' }}>{stat.value}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', margin: '16px 0' }}>
            <div style={{ color: '#16a34a', fontWeight: 600, marginBottom: '4px' }}>
              💡 Top saving this week
            </div>
            <p style={{ margin: 0, color: '#374151', fontSize: '14px', lineHeight: '1.6' }}>
              {topSaving.description} — saved <strong>${topSaving.saved.toFixed(2)}</strong>
            </p>
          </div>

          <a href="https://app.tokensentry.ai/analytics" style={{
            display: 'block', background: '#4f46e5', color: '#fff',
            padding: '12px 24px', borderRadius: '6px', textDecoration: 'none',
            textAlign: 'center', marginTop: '24px', fontWeight: 600,
          }}>
            View Full Analytics Dashboard →
          </a>
        </div>
      </body>
    </html>
  )
}
