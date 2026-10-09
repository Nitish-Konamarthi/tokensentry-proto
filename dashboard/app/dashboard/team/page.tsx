'use client'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useMembers, useRemoveMember } from '@/lib/hooks'

const ROLE_BADGES: Record<string, 'default' | 'info' | 'secondary'> = {
  owner: 'default',
  admin: 'info',
  member: 'secondary',
}

export default function TeamPage() {
  const { data: members, isLoading } = useMembers()
  const removeMember = useRemoveMember()

  function handleRemove(memberId: string) {
    if (confirm('Remove this member from the organization?')) {
      removeMember.mutate(memberId)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Team Management" description="Manage team members and roles" />

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Team invitations are not configured in V1. Members must be provisioned through the identity provider before they can be assigned to this organization.
          </p>
        </CardContent>
      </Card>

      {/* Members table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: 'email', header: 'Email', cell: (r: any) => r.email },
              {
                key: 'role', header: 'Role',
                cell: (r: any) => <Badge variant={ROLE_BADGES[r.role] ?? 'secondary'}>{r.role}</Badge>,
              },
              { key: 'joined_at', header: 'Joined', cell: (r: any) => formatDateTime(r.joined_at) },
              {
                key: 'actions', header: '',
                cell: (r: any) => r.role !== 'owner' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(r.id)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null,
              },
            ]}
            data={members ?? []}
            loading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
