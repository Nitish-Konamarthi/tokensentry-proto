'use client'

import { useMemo } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatCompact } from '@/lib/utils'
import { useAgentSessions } from '@/lib/hooks'
import { Bot, AlertTriangle, Activity, Shield } from 'lucide-react'

const STATUS_BADGES: Record<string, 'success' | 'destructive' | 'warning' | 'info'> = {
  active: 'success',
  terminated: 'destructive',
  completed: 'info',
  blocked: 'warning',
}

export default function AgentGuardPage() {
  const { data: sessions, isLoading } = useAgentSessions()

  const metrics = useMemo(() => {
    const list = sessions ?? []
    const active = list.filter(s => s.status === 'active').length
    const total = list.length
    const flagged = list.filter(s => s.loopDetected).length
    return { active, total, flagged }
  }, [sessions])

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader title="Agent Guard" description="Review gateway-observed agent sessions and risk flags" />
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
      <PageHeader title="Agent Guard" description="Review gateway-observed agent sessions and risk flags">
        {metrics.flagged > 0 && (
          <Badge variant="warning">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {metrics.flagged} Flagged Session{metrics.flagged > 1 ? 's' : ''}
          </Badge>
        )}
        {metrics.flagged === 0 && (
          <Badge variant="success">
            <Shield className="h-3 w-3 mr-1" />
            All Clear
          </Badge>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Active Agents" value={metrics.active.toString()} icon={<Activity className="h-4 w-4" />} />
        <MetricCard title="Total Sessions" value={metrics.total.toString()} icon={<Bot className="h-4 w-4" />} />
        <MetricCard
          title="Flagged Sessions"
          value={metrics.flagged.toString()}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={metrics.flagged > 0 ? 'up' : undefined}
          trendLabel={metrics.flagged > 0 ? 'requires attention' : undefined}
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
                    {r.loopDetected && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
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
                key: 'turnCount', header: 'Requests',
                cell: (r: any) => formatCompact(r.turnCount),
              },
              {
                key: 'tokensConsumed', header: 'Tokens Used',
                cell: (r: any) => (
                  <div className="flex items-center gap-2">
                    <span>{formatCompact(r.tokensConsumed)}</span>
                    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(r.tokensConsumed / Math.max(r.tokenBudget, 1)) > 0.8 ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min((r.tokensConsumed / Math.max(r.tokenBudget, 1)) * 100, 100)}%` }}
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
