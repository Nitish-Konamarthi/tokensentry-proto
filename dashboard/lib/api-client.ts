import type {
  RealtimeMetrics, DailyRow, ModelRow, BudgetPolicy,
  ApiKey, TeamMember, AuditLogEntry, ProviderHealth, AgentSession, OrgSettings,
} from './types'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'

function getKey(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('ts_api_key') ?? ''
  }
  return process.env['NEXT_PUBLIC_TS_KEY'] ?? ''
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const error = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${error}`)
  }

  return res.json()
}

export const api = {
  // ── Realtime ──
  getRealtime: () => request<RealtimeMetrics>('/v1/budgets'),

  // ── Analytics ──
  getSpendTimeSeries: (days: number) =>
    request<{ time_series: DailyRow[] }>(`/v1/analytics/spend?days=${days}`),

  getModelDistribution: (days: number) =>
    request<ModelRow[]>(`/v1/analytics/models?days=${days}`),

  // ── Budgets ──
  getBudgets: () => request<{ policy: BudgetPolicy | null; current: { today_usd: number; this_month_usd: number; utilization_pct: number } }>('/v1/budgets'),

  updateBudget: (data: { monthly_limit_usd: number; daily_limit_usd?: number }) =>
    request<{ success: boolean; policy_id: string }>('/v1/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSpendDetail: (days: number) =>
    request<{ time_series: Array<{ date: string; spend_usd: number; calls: number }>; model_distribution: Array<{ model: string; calls: number; cost_usd: number }>; current_month_total_usd: number }>(`/v1/budgets/spend?days=${days}`),

  // ── API Keys ──
  getApiKeys: () => request<ApiKey[]>('/v1/api-keys'),

  createApiKey: (name: string, expiresInDays?: number) =>
    request<{ id: string; name: string; key: string; created_at: string; expires_at: string | null }>('/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, expires_in_days: expiresInDays }),
    }),

  revokeApiKey: (id: string) =>
    request<{ success: boolean; revoked_at: string }>(`/v1/api-keys/${id}`, { method: 'DELETE' }),

  // ── Agent Guard ──
  getAgentSessions: (orgId: string) =>
    request<AgentSession[]>(`/v1/agents?org_id=${orgId}`),

  // ── Audit Log ──
  getAuditLogs: (orgId: string, limit = 50, action?: string) => {
    const params = new URLSearchParams({ org_id: orgId, limit: String(limit) })
    if (action && action !== 'all') params.set('action', action)
    return request<AuditLogEntry[]>(`/v1/audit-logs?${params}`)
  },

  // ── Providers ──
  getProviderHealth: () => request<{ providers: Array<{ provider: string; name: string; configured: boolean }> }>('/v1/providers/health'),

  updateProviderKeys: (keys: Record<string, string>) =>
    request<{ success: boolean; updated: string[] }>('/v1/providers/keys', {
      method: 'PUT',
      body: JSON.stringify(keys),
    }),

  // ── Settings ──
  getSettings: () => request<OrgSettings>('/v1/settings'),

  updateSettings: (data: { name?: string; model_policy?: Record<string, unknown> }) =>
    request<OrgSettings>('/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Team ──
  getMembers: () => request<TeamMember[]>('/v1/members'),

  inviteMember: (email: string, role?: string) =>
    request<TeamMember>('/v1/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  removeMember: (memberId: string) =>
    request<{ success: boolean }>(`/v1/members/${memberId}`, { method: 'DELETE' }),
}
