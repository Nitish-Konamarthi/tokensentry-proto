'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { DataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { useAuditLogs } from '@/lib/hooks'

const ACTION_BADGES: Record<string, 'default' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
  'api_key.created': 'default',
  'api_key.revoked': 'destructive',
  'budget.updated': 'warning',
  'settings.changed': 'info',
  'member.invited': 'secondary',
  'member.removed': 'destructive',
}

const FILTER_MAP: Record<string, string | undefined> = {
  all: undefined,
  api_key: 'api_key',
  budget: 'budget',
  settings: 'settings',
  member: 'member',
}

export default function AuditLogPage() {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const { data: logs, isLoading } = useAuditLogs(pageSize, FILTER_MAP[filter])

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Audit Logs" description="Track all configuration changes and security events">
        <Select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Events' },
            { value: 'api_key', label: 'API Keys' },
            { value: 'budget', label: 'Budgets' },
            { value: 'settings', label: 'Settings' },
            { value: 'member', label: 'Members' },
          ]}
          className="w-36"
        />
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: 'created_at', header: 'Time', cell: (r: any) => formatDateTime(r.created_at) },
              { key: 'action', header: 'Action', cell: (r: any) => <Badge variant={ACTION_BADGES[r.action] ?? 'secondary'}>{r.action}</Badge> },
              { key: 'resource', header: 'Resource', cell: (r: any) => <code className="text-xs font-mono text-muted-foreground">{r.resource}</code> },
              { key: 'actor_id', header: 'Actor', cell: (r: any) => r.actor_id ?? <span className="text-muted-foreground">System</span> },
              { key: 'ip', header: 'IP Address', cell: (r: any) => r.ip ?? '—' },
            ]}
            data={logs ?? []}
            loading={isLoading}
          />
        </CardContent>
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
