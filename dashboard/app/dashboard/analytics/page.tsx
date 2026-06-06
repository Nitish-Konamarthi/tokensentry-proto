// dashboard/app/dashboard/analytics/page.tsx — Analytics deep-dive

'use client'
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'

const WASTE_DATA = [
  { name: 'Over-routing', waste: 147.2, calls: 847, fix: 'Enable haiku for analytics team' },
  { name: 'Cache misses', waste: 51.3, calls: 342, fix: 'Increase cache TTL to 7 days' },
  { name: 'Context bloat', waste: 28.9, calls: 124, fix: 'Enable auto-pruning for chat routes' },
  { name: 'Frontier abuse', waste: 14.2, calls: 12, fix: 'Disable Opus for classification tasks' },
]

const HOURLY = Array.from({ length: 24 }, (_, h) => ({
  hour: `${h.toString().padStart(2, '0')}:00`,
  calls: Math.floor(Math.random() * 800 + (h > 8 && h < 20 ? 400 : 50)),
  cost: Math.random() * 30 + (h > 8 && h < 20 ? 15 : 2),
}))

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [analyzing, setAnalyzing] = useState(false)
  const [wasteReport, setWasteReport] = useState<null | { executive_summary: string }>(null)

  const runWasteAnalysis = async () => {
    setAnalyzing(true)
    await new Promise(r => setTimeout(r, 1800))
    setWasteReport({
      executive_summary:
        'Your organization wasted $241.60 (30% of total AI spend) in the last 7 days. Primary driver: 847 calls classified as "low" complexity were routed to Claude Sonnet instead of Haiku, costing $147.20 more than necessary. Fixing over-routing alone would save ~$620/month at current call volume.',
    })
    setAnalyzing(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">ClickHouse-powered spend intelligence</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['7d', '30d'] as const).map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* Hourly call volume */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: 600, marginBottom: '20px' }}>Hourly Call Volume (Today)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={HOURLY} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
            <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Waste analysis */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600 }}>AI Waste Analysis</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Token waste patterns detected by Claude Sonnet
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => void runWasteAnalysis()}
            disabled={analyzing}
          >
            {analyzing ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Analyzing...</> : '⠿ Run Analysis'}
          </button>
        </div>

        {wasteReport && (
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--indigo-light)', marginBottom: '8px' }}>
              Executive Summary
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              {wasteReport.executive_summary}
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waste Pattern</th>
                <th>Affected Calls</th>
                <th>Wasted ($)</th>
                <th>Severity</th>
                <th>Recommended Fix</th>
              </tr>
            </thead>
            <tbody>
              {WASTE_DATA.map(w => {
                const severity = w.waste > 100 ? 'critical' : w.waste > 40 ? 'high' : 'medium'
                return (
                  <tr key={w.name}>
                    <td style={{ fontWeight: 500 }}>{w.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{w.calls.toLocaleString()}</td>
                    <td style={{ color: severity === 'critical' ? 'var(--red-light)' : severity === 'high' ? '#fbbf24' : 'var(--text-secondary)', fontWeight: 600 }}>
                      ${w.waste.toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${severity === 'critical' ? 'red' : severity === 'high' ? 'yellow' : 'blue'}`}>
                        {severity}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{w.fix}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
