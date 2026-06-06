'use client'
// dashboard/app/dashboard/page.tsx — Spend Overview (main dashboard)

import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
const TEST_KEY = 'ts_live_test_d3ad8eef4f2b1234'

// Mock data for demo (replace with real API calls when keys are configured)
const MOCK_DAILY = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(); date.setDate(date.getDate() - (29 - i))
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    spend: Math.random() * 120 + 40,
    saved: Math.random() * 80 + 20,
    calls: Math.floor(Math.random() * 2000 + 500),
  }
})

const MOCK_MODELS = [
  { name: 'Haiku', value: 68, color: '#34d399' },
  { name: 'Sonnet', value: 28, color: '#818cf8' },
  { name: 'Opus', value: 2,  color: '#fbbf24' },
  { name: 'Cached', value: 2,  color: '#475569' },
]

const CUSTOM_TOOLTIP = ({ active, payload, label }: Record<string, unknown>) => {
  if (!active || !payload) return null
  const p = payload as Array<{ name: string; value: number; color: string }>
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: '160px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{String(label)}</div>
      {p.map((entry) => (
        <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px', marginBottom: '4px' }}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ fontWeight: 600 }}>${Number(entry.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [realtimeData, setRealtimeData] = useState({
    today_usd: 0,
    this_month_usd: 0,
    monthly_limit_usd: 500,
    utilization: 0,
    budget_remaining_usd: 500,
    status: 'healthy' as 'healthy' | 'warning' | 'critical',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Try to load real data
    fetch(`${API_URL}/v1/spend/realtime`, {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    })
      .then(r => r.json())
      .then(data => { setRealtimeData(data); setLoading(false) })
      .catch(() => {
        // Use mock data if API not available
        setRealtimeData({
          today_usd: 47.32,
          this_month_usd: 342.18,
          monthly_limit_usd: 500,
          utilization: 0.684,
          budget_remaining_usd: 157.82,
          status: 'healthy',
        })
        setLoading(false)
      })

    const interval = setInterval(() => {
      fetch(`${API_URL}/v1/spend/realtime`, {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      })
        .then(r => r.json())
        .then(setRealtimeData)
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const utilizationPct = Math.round(realtimeData.utilization * 100)
  const budgetStatus = utilizationPct < 80 ? 'healthy' : utilizationPct < 95 ? 'warning' : 'critical'

  const totalSpend = MOCK_DAILY.reduce((s, d) => s + d.spend, 0)
  const totalSaved = MOCK_DAILY.reduce((s, d) => s + d.saved, 0)
  const savingsRate = Math.round(totalSaved / (totalSaved + totalSpend) * 100)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">Real-time AI spend and governance metrics</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`badge ${budgetStatus === 'healthy' ? 'green' : budgetStatus === 'warning' ? 'yellow' : 'red'}`}>
            ● {budgetStatus}
          </span>
          <button className="btn btn-secondary btn-sm">Export CSV</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="card-grid card-grid-4" style={{ marginBottom: '24px' }}>
        <div className="card stat-card">
          <div className="stat-label">This Month</div>
          <div className="stat-value">${realtimeData.this_month_usd.toFixed(0)}</div>
          <div className="stat-sub">of ${realtimeData.monthly_limit_usd.toFixed(0)} budget</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Today</div>
          <div className="stat-value">${realtimeData.today_usd.toFixed(2)}</div>
          <div className={`stat-sub ${realtimeData.today_usd < 20 ? 'positive' : ''}`}>
            {realtimeData.today_usd < 20 ? '↓ Under daily avg' : '↑ Above daily avg'}
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Saved (30d)</div>
          <div className="stat-value" style={{ color: 'var(--green-light)', WebkitTextFillColor: 'var(--green-light)' }}>
            ${totalSaved.toFixed(0)}
          </div>
          <div className="stat-sub positive">{savingsRate}% savings rate</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Budget Left</div>
          <div className="stat-value">${realtimeData.budget_remaining_usd.toFixed(0)}</div>
          <div className={`stat-sub ${budgetStatus === 'warning' ? 'warning' : budgetStatus === 'critical' ? 'negative' : ''}`}>
            {utilizationPct}% used
          </div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Monthly Budget Utilization</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              ${realtimeData.this_month_usd.toFixed(2)} of ${realtimeData.monthly_limit_usd.toFixed(2)} · Resets {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString()}
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800 }}>{utilizationPct}%</div>
        </div>
        <div className="budget-bar-track" style={{ height: '12px' }}>
          <div
            className={`budget-bar-fill ${budgetStatus}`}
            style={{ width: `${Math.min(utilizationPct, 100)}%` }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>$0</span>
          <span style={{ color: '#f59e0b' }}>80% alert</span>
          <span style={{ color: '#ef4444' }}>95% alert</span>
          <span>${realtimeData.monthly_limit_usd}</span>
        </div>
      </div>

      {/* Charts row */}
      <div className="card-grid card-grid-2" style={{ marginBottom: '24px' }}>
        {/* Spend chart */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: '20px' }}>Daily Spend vs Savings (30d)</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MOCK_DAILY} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} interval={6} />
              <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Area type="monotone" dataKey="spend" name="Spend" stroke="#6366f1" fill="url(#gradSpend)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="saved" name="Saved" stroke="#10b981" fill="url(#gradSaved)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model distribution */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: '20px' }}>Model Distribution (30d)</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={MOCK_MODELS} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                dataKey="value" paddingAngle={3}>
                {MOCK_MODELS.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`, 'Calls']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
              <Legend
                formatter={(value) => <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{value}</span>}
                iconType="circle" iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', justifyContent: 'center' }}>
            {MOCK_MODELS.map(m => (
              <span key={m.name} className={`badge model-pill ${m.name.toLowerCase()}`}>{m.name} {m.value}%</span>
            ))}
          </div>
        </div>
      </div>

      {/* Quick start guide */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: '16px' }}>
          One Line to Integrate
          <span className="badge blue" style={{ marginLeft: '12px', verticalAlign: 'middle' }}>Quick Start</span>
        </div>
        <div className="code-block">
          <pre>
            <span className="code-del">- new Anthropic({'{ apiKey: process.env.ANTHROPIC_API_KEY }'})</span>
            <span className="code-add">+ new Anthropic({'{ apiKey: process.env.TOKENSENTRY_KEY,'}){'\n'}+              {'baseURL: "https://api.tokensentry.ai/v1/proxy" }'})</span>
          </pre>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            ✓ Requests to Opus automatically routed to Haiku when complexity is low
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            ✓ Semantic cache returns saved responses at zero token cost
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            ✓ Budget hard-blocked at your configured limit
          </div>
        </div>
      </div>
    </div>
  )
}
