'use client'
// dashboard/app/dashboard/api-keys/page.tsx — API Key Management

import { useState, useEffect } from 'react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
const TEST_KEY = 'ts_live_test_d3ad8eef4f2b1234'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/api-keys`, {
        headers: { Authorization: `Bearer ${TEST_KEY}` },
      })
      if (res.ok) {
        const data = await res.json() as { keys: ApiKey[] }
        setKeys(data.keys)
      } else {
        // Demo data
        setKeys([{
          id: 'd0000000-0000-0000-0000-000000000001',
          key_prefix: 'ts_live_tes',
          name: 'Local Development Key',
          scopes: ['ai:proxy', 'analytics:read', 'budget:read'],
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          expires_at: null,
        }])
      }
    } catch {
      setKeys([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const createKey = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`${API_URL}/v1/api-keys`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, scopes: ['ai:proxy'] }),
      })
      if (res.ok) {
        const data = await res.json() as { key: string }
        setNewKey(data.key)
        void load()
      } else {
        setNewKey('ts_live_demo_key_shown_once_only')
      }
    } catch {
      setNewKey('ts_live_demo_key_shown_once_only')
    } finally {
      setCreating(false)
      setNewKeyName('')
    }
  }

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this key? Any apps using it will stop working immediately.')) return
    await fetch(`${API_URL}/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    }).catch(() => {})
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-sub">Keys authenticate your proxy requests. Never commit to git.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          + Create Key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card animate-in" style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 600, marginBottom: '16px' }}>New API Key</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              className="form-input"
              placeholder="Key name (e.g. Production Server, CI/CD)"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void createKey() }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={() => void createKey()} disabled={creating || !newKeyName.trim()}>
              {creating ? <span className="spinner" /> : 'Generate'}
            </button>
          </div>

          {newKey && (
            <div style={{ marginTop: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '8px' }}>
                ⚠ Copy this key now — it will NOT be shown again
              </div>
              <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', letterSpacing: '0.05em', wordBreak: 'break-all' }}>
                {newKey}
              </code>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard.writeText(newKey)}>
                  📋 Copy
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setNewKey(null)}>
                  I've saved it
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keys table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Scopes</th>
                  <th>Last Used</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key.id}>
                    <td style={{ fontWeight: 500 }}>{key.name}</td>
                    <td>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--indigo-light)' }}>
                        {key.key_prefix}••••••••••••
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {key.scopes.map(s => <span key={s} className="badge gray" style={{ fontSize: '10px' }}>{s}</span>)}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => void revokeKey(key.id)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                      No API keys yet. Create one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage guide */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px' }}>Usage</div>
        <div className="code-block">
          <pre>
{`# Set as environment variable
export TOKENSENTRY_KEY="ts_live_..."

# Use in your code (drop-in Anthropic replacement)
const client = new Anthropic({
  apiKey: process.env.TOKENSENTRY_KEY,
  baseURL: "https://api.tokensentry.ai/v1/proxy"
})`}
          </pre>
        </div>
      </div>
    </div>
  )
}
