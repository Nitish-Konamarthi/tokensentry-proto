'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2, UserPlus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useMembers, useInviteMember, useRemoveMember } from '@/lib/hooks'

const ROLE_BADGES: Record<string, 'default' | 'info' | 'secondary'> = {
  owner: 'default',
  admin: 'info',
  member: 'secondary',
}

export default function TeamPage() {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  const { data: members, isLoading } = useMembers()
  const inviteMember = useInviteMember()
  const removeMember = useRemoveMember()

  function handleInvite() {
    if (!inviteEmail.includes('@')) return
    inviteMember.mutate({ email: inviteEmail, role: inviteRole }, {
      onSuccess: () => {
        setInviteEmail('')
      },
    })
  }

  function handleRemove(memberId: string) {
    if (confirm('Remove this member from the organization?')) {
      removeMember.mutate(memberId)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Team Management" description="Manage team members and roles" />

      {/* Invite form */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Invite by Email</label>
              <Input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                type="email"
                onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Role</label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              variant="secondary"
              onClick={handleInvite}
              disabled={!inviteEmail.includes('@') || inviteMember.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Send Invite
            </Button>
          </div>
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
