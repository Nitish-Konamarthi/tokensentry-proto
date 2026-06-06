'use client'
// dashboard/app/dashboard/budgets/page.tsx — Budget Policy Management

import { useState } from 'react'

interface BudgetPolicy {
  id: string
  scope: 'org' | 'team' | 'user'
  name: string
  monthly_limit_usd: number
  daily_limit_usd: number | null
  on_exhaustion: 'block' | 'downgrade' | 'alert_only'
  downgrade_to_model: string
  current_spend: number
}

const DEMO_POLICIES: BudgetPolicy[] = [
  {
    id: '1', scope: 'org', name: 'Acme Corp (Organization)',
    monthly_limit_usd: 500, daily_limit_usd: 25, on_exhaustion: 'downgrade',
    downgrade_to_model: 'claude-haiku-4-5', current_spend: 342.18,
  },
  {
    id: '2', scope: 'team', name: 'Engineering Team',
    monthly_limit_usd: 250, daily_limit_usd: null, on_exhaustion: 'downgrade',
    downgrade_to_model: 'claude-haiku-4-5', current_spend: 198.44,
  },
  {
    id: '3', scope: 'team', name: 'Analytics Team',
    monthly_limit_usd: 100, daily_limit_usd: null, on_exhaustion: 'block',
    downgrade_to_model: 'claude-haiku-4-5', current_spend: 87.42,
  },
]

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku ($0.80/M)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet ($3.00/M)' },
]

const EXHAUSTION_OPTIONS = [
  { value: 'downgrade',   label: 'Downgrade model' },
  { value: 'block',       label: 'Block all requests' },
  { value: 'alert_only',  label: 'Alert only (no block)' },
]

export default function BudgetsPage() {
  const [policies, setPolicies] = useState<BudgetPolicy[]>(DEMO_POLICIES)
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const handleSave = (id: string) => {
    setSaved(id)
    setEditing(null)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget Policies</h1>
          <p className="page-sub">Hierarchical limits: org → team → user. Lower wins.</p>
        </div>
        <button className="btn btn-primary">+ New Policy</button>
      </div>

      {/* Summary */}
      <div className="card-grid card-grid-3" style={{ marginBottom: '24px' }}>
        {policies.map(policy => {
          const pct = Math.round(policy.current_spend / policy.monthly_limit_usd * 100)
          const status = pct < 80 ? 'healthy' : pct < 95 ? 'warning' : 'critical'
          return (
            <div key={policy.id} className="card stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className={`badge ${policy.scope === 'org' ? 'blue' : 'gray'}`}>
                  {policy.scope}
                </span>
                <span className={`badge ${status === 'healthy' ? 'green' : status === 'warning' ? 'yellow' : 'red'}`}>
                  {pct}%
                </span>
              </div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{policy.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                ${policy.current_spend.toFixed(2)} / ${policy.monthly_limit_usd.toFixed(0)}/mo
              </div>
              <div className="budget-bar-track">
                <div className={`budget-bar-fill ${status}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                On exhaustion: <strong style={{ color: 'var(--text-secondary)' }}>{policy.on_exhaustion.replace('_', ' ')}</strong>
              </div>
            </div>
          )
        })}
      </div>

      {/* Policy details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {policies.map(policy => (
          <div key={policy.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span className={`badge ${policy.scope === 'org' ? 'blue' : 'gray'} model-pill`} style={{ marginRight: '8px' }}>
                  {policy.scope}
                </span>
                <span style={{ fontWeight: 600 }}>{policy.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {saved === policy.id && <span className="badge green">✓ Saved</span>}
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(editing === policy.id ? null : policy.id)}>
                  {editing === policy.id ? 'Cancel' : 'Edit'}
                </button>
              </div>
            </div>

            {editing === policy.id ? (
              <div className="card-grid card-grid-2" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Monthly Limit (USD)</label>
                  <input
                    className="form-input"
                    type="number"
                    defaultValue={policy.monthly_limit_usd}
                    onChange={e => {
                      const updated = policies.map(p =>
                        p.id === policy.id ? { ...p, monthly_limit_usd: parseFloat(e.target.value) } : p
                      )
                      setPolicies(updated)
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Daily Limit (USD, optional)</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="No limit"
                    defaultValue={policy.daily_limit_usd ?? ''}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">On Budget Exhaustion</label>
                  <select
                    className="form-input"
                    defaultValue={policy.on_exhaustion}
                    onChange={e => {
                      const updated = policies.map(p =>
                        p.id === policy.id ? { ...p, on_exhaustion: e.target.value as 'block' | 'downgrade' | 'alert_only' } : p
                      )
                      setPolicies(updated)
                    }}
                  >
                    {EXHAUSTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Downgrade To</label>
                  <select className="form-input" defaultValue={policy.downgrade_to_model}>
                    {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => handleSave(policy.id)}>Save Policy</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', fontSize: '14px' }}>
                <div>
                  <div className="stat-label" style={{ marginBottom: '4px' }}>Monthly Limit</div>
                  <div style={{ fontWeight: 600 }}>${policy.monthly_limit_usd}</div>
                </div>
                <div>
                  <div className="stat-label" style={{ marginBottom: '4px' }}>Daily Limit</div>
                  <div style={{ fontWeight: 600 }}>{policy.daily_limit_usd ? `$${policy.daily_limit_usd}` : '—'}</div>
                </div>
                <div>
                  <div className="stat-label" style={{ marginBottom: '4px' }}>On Exhaustion</div>
                  <div style={{ fontWeight: 600 }}>{policy.on_exhaustion.replace('_', ' ')}</div>
                </div>
                <div>
                  <div className="stat-label" style={{ marginBottom: '4px' }}>Downgrade To</div>
                  <span className={`badge model-pill ${policy.downgrade_to_model.includes('haiku') ? 'haiku' : 'sonnet'}`}>
                    {policy.downgrade_to_model.includes('haiku') ? 'haiku' : 'sonnet'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
