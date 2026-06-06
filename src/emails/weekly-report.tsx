// src/emails/weekly-report.tsx — Weekly report (Every Monday) (§E4)
import * as React from 'react'

interface WeeklyReportProps {
  orgName: string
  weekOf: string
  totalSpend: number
  totalSaved: number
  cacheHitRate: number
  callCount: number
  budgetUsedPct: number
  topTeams: Array<{ name: string; spend: number; pct: number }>
  modelBreakdown: { haiku: number; sonnet: number; opus: number }
  projectedMonthEnd: number
  monthlyBudget: number
}

export function WeeklyReportEmail(p: WeeklyReportProps) {
  const willExceed = p.projectedMonthEnd > p.monthlyBudget
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#6366f1', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', margin: 0 }}>
            TOKENSENTRY WEEKLY REPORT
          </div>
          <h1 style={{ fontSize: '22px', color: '#111', marginTop: '4px' }}>
            {p.orgName} — Week of {p.weekOf}
          </h1>

          {/* Key Numbers */}
          <div style={{ display: 'flex', gap: '16px', margin: '24px 0' }}>
            {[
              { label: 'Total Spend', value: `$${p.totalSpend.toFixed(2)}`, accent: false },
              { label: 'Total Saved', value: `$${p.totalSaved.toFixed(2)}`, accent: true },
              { label: 'Cache Hit Rate', value: `${(p.cacheHitRate * 100).toFixed(0)}%`, accent: false },
              { label: 'API Calls', value: p.callCount.toLocaleString(), accent: false },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: stat.accent ? '#10b981' : '#111', margin: 0 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <hr style={{ borderColor: '#e5e7eb' }} />

          {/* Team breakdown */}
          <p style={{ fontWeight: 'bold', color: '#111', marginBottom: '8px' }}>Spend by Team</p>
          {p.topTeams.map(team => (
            <div key={team.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ width: '35%', fontSize: '14px', color: '#374151' }}>{team.name}</div>
              <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#6366f1', width: `${team.pct}%`, height: '100%', borderRadius: '99px' }} />
              </div>
              <div style={{ width: '15%', textAlign: 'right', fontSize: '13px', fontWeight: 'bold' }}>
                ${team.spend.toFixed(0)}
              </div>
            </div>
          ))}

          <hr style={{ borderColor: '#e5e7eb' }} />

          {/* Model routing */}
          <p style={{ fontWeight: 'bold', color: '#111', marginBottom: '4px' }}>Model Routing</p>
          <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>
            Haiku {(p.modelBreakdown.haiku * 100).toFixed(0)}% ·
            Sonnet {(p.modelBreakdown.sonnet * 100).toFixed(0)}% ·
            Opus {(p.modelBreakdown.opus * 100).toFixed(0)}%
          </p>

          <hr style={{ borderColor: '#e5e7eb' }} />

          {/* Budget status */}
          <div style={{
            background: willExceed ? '#fef2f2' : '#f0fdf4',
            borderRadius: '6px', padding: '12px 16px', margin: '16px 0',
          }}>
            <p style={{ margin: 0, color: willExceed ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
              {willExceed ? '⚠️' : '✓'} Monthly Budget: {p.budgetUsedPct.toFixed(0)}% used
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#555' }}>
              Projected month-end: ${p.projectedMonthEnd.toFixed(0)} of ${p.monthlyBudget.toFixed(0)} budget.
              {willExceed ? ' You\'re on track to exceed your budget.' : ' You\'re on track to stay within budget.'}
            </p>
          </div>

          <a href="https://app.tokensentry.ai/analytics" style={{
            display: 'inline-block', background: '#4f46e5', color: '#fff',
            padding: '10px 20px', borderRadius: '6px', textDecoration: 'none',
          }}>
            View Full Analytics →
          </a>
        </div>
      </body>
    </html>
  )
}
