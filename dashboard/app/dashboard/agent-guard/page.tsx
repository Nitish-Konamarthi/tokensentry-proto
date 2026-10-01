'use client'

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatCompact } from '@/lib/utils'
import { useAgentSessions } from '@/lib/hooks'
import { Bot, AlertTriangle, Activity, Shield, XCircle } from 'lucide-react'

const STATUS_BADGES: Record<string, 'success' | 'destructive' | 'warning' | 'info'> = {
  active: 'success',
  terminated: 'destructive',
  completed: 'info',
  blocked: 'warning',
}

export default function AgentGuardPage() {
  const [orgId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ts_org_id') ?? 'default'
    }
    return 'default'
  })

  const { data: sessions, isLoading } = useAgentSessions(orgId)

  const metrics = useMemo(() => {
    const list = sessions ?? []
    const active = list.filter(s => s.status === 'active').length
    const total = list.length
    const looped = list.filter(s => s.loop_detected).length
    const tokensSaved = list
      .filter(s => s.loop_detected)
      .reduce((sum, s) => sum + s.token_budget - s.tokens_consumed, 0)
    return { active, total, looped, tokensSaved }
  }, [sessions])

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader title="Agent Guard" description="Monitor and protect against runaway AI agents" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Agent Guard" description="Monitor and protect against runaway AI agents">
        {metrics.looped > 0 && (
          <Badge variant="warning">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {metrics.looped} Loop{metrics.looped > 1 ? 's' : ''} Detected
          </Badge>
        )}
        {metrics.looped === 0 && (
          <Badge variant="success">
            <Shield className="h-3 w-3 mr-1" />
            All Clear
          </Badge>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard title="Active Agents" value={metrics.active.toString()} icon={<Activity className="h-4 w-4" />} />
        <MetricCard title="Total Sessions" value={metrics.total.toString()} icon={<Bot className="h-4 w-4" />} />
        <MetricCard
          title="Loops Detected"
          value={metrics.looped.toString()}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={metrics.looped > 0 ? 'up' : undefined}
          trendLabel={metrics.looped > 0 ? 'requires attention' : undefined}
        />
        <MetricCard
          title="Tokens Saved"
          value={metrics.tokensSaved > 0 ? formatCompact(metrics.tokensSaved) : '0'}
          subtitle="by early termination"
          icon={<Shield className="h-4 w-4" />}
          trend={metrics.tokensSaved > 0 ? 'up' : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: 'agentId', header: 'Agent',
                cell: (r: any) => (
                  <div className="flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{r.agentId}</span>
                    {r.loop_detected && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                  </div>
                ),
              },
              {
                key: 'status', header: 'Status',
                cell: (r: any) => (
                  <Badge variant={STATUS_BADGES[r.status] ?? 'info'}>{r.status}</Badge>
                ),
              },
              {
                key: 'turnCount', header: 'Turns',
                cell: (r: any) => formatCompact(r.turnCount),
              },
              {
                key: 'tokensConsumed', header: 'Tokens Used',
                cell: (r: any) => (
                  <div className="flex items-center gap-2">
                    <span>{formatCompact(r.tokensConsumed)}</span>
                    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(r.tokensConsumed / r.tokenBudget) > 0.8 ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min((r.tokensConsumed / r.tokenBudget) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'startedAt', header: 'Started',
                cell: (r: any) => formatDateTime(r.startedAt),
              },
              {
                key: 'terminatedAt', header: 'Terminated',
                cell: (r: any) => r.terminatedAt ? formatDateTime(r.terminatedAt) : <span className="text-muted-foreground">—</span>,
              },
            ]}
            data={sessions ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
