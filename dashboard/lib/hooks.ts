'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api-client'
import type { RealtimeMetrics, DailyRow, ModelRow, BudgetPolicy, ApiKey } from './types'
import { useUser } from '@auth0/nextjs-auth0/client'

function useOrgId(): string | undefined {
  const { user } = useUser()
  return (user as Record<string, string>)?.['https://api.tokensentry.ai/org_id'] ?? 'default'
}

// ── Realtime Metrics (polls every 30s) ──

export function useRealtime() {
  return useQuery({
    queryKey: ['realtime'],
    queryFn: api.getBudgets,
    refetchInterval: 30_000,
  })
}

// ── Spend Time Series ──

export function useSpendTimeSeries(days: number) {
  return useQuery({
    queryKey: ['spend', 'time-series', days],
    queryFn: () => api.getSpendTimeSeries(days),
    staleTime: 60_000,
  })
}

// ── Model Distribution ──

export function useModelDistribution(days: number) {
  return useQuery({
    queryKey: ['spend', 'models', days],
    queryFn: () => api.getModelDistribution(days),
    staleTime: 60_000,
  })
}

// ── Spend Detail (budgets page) ──

export function useSpendDetail(days: number) {
  return useQuery({
    queryKey: ['spend', 'detail', days],
    queryFn: () => api.getSpendDetail(days),
    staleTime: 60_000,
  })
}

// ── Budgets ──

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: api.getBudgets,
    staleTime: 30_000,
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.updateBudget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

// ── API Keys ──

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: api.getApiKeys,
    staleTime: 30_000,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, expiresInDays }: { name: string; expiresInDays?: number }) =>
      api.createApiKey(name, expiresInDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

// ── Agent Guard ──

export function useAgentSessions(orgId: string) {
  return useQuery({
    queryKey: ['agents', orgId],
    queryFn: () => api.getAgentSessions(orgId),
    staleTime: 30_000,
  })
}

// ── Audit Log ──

export function useAuditLogs(limit = 50, action?: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['audit-logs', orgId, limit, action],
    queryFn: () => api.getAuditLogs(orgId ?? '', limit, action),
    enabled: !!orgId,
    staleTime: 15_000,
  })
}

// ── Providers ──

export function useProviderHealth() {
  return useQuery({
    queryKey: ['provider-health'],
    queryFn: api.getProviderHealth,
    refetchInterval: 60_000,
  })
}

// ── Settings ──

export function useSettings() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['settings', orgId],
    queryFn: api.getSettings,
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

// ── Team ──

export function useMembers() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['members', orgId],
    queryFn: api.getMembers,
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.removeMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
