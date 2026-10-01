'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/hooks'
import { formatDateTime } from '@/lib/utils'
import { Key, Copy, Trash2, Plus, Check } from 'lucide-react'

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys()
  const createKey = useCreateApiKey()
  const revokeKey = useRevokeApiKey()

  const [showNew, setShowNew] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (!keyName.trim()) return
    const result = await createKey.mutateAsync({ name: keyName })
    setNewKeyValue(result.key)
    setKeyName('')
    setShowNew(false)
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any services using it will immediately lose access.')) return
    await revokeKey.mutateAsync(id)
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="API Keys" description="Manage API keys for programmatic access">
        <Button onClick={() => { setShowNew(true); setNewKeyValue(null) }}>
          <Plus className="h-4 w-4 mr-2" />
          Create Key
        </Button>
      </PageHeader>

      {/* New key dialog */}
      {showNew && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Create New API Key</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Key Name</label>
                <Input
                  value={keyName}
                  onChange={e => setKeyName(e.target.value)}
                  placeholder="e.g. Production CI"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <Button onClick={handleCreate} disabled={createKey.isPending || !keyName.trim()}>
                {createKey.isPending ? 'Creating...' : 'Generate'}
              </Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>

            {newKeyValue && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-medium text-emerald-400 mb-2">Key created — copy it now. You won't see it again.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">{newKeyValue}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKeyValue)}>
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Keys table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: 'name', header: 'Name',
                cell: (r: any) => (
                  <div className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{r.name}</span>
                  </div>
                ),
              },
              { key: 'prefix', header: 'Key Prefix', cell: (r: any) => <code className="text-xs font-mono text-muted-foreground">{r.prefix}...</code> },
              { key: 'scopes', header: 'Scopes', cell: (r: any) => r.scopes?.join(', ') ?? 'proxy' },
              {
                key: 'created_at', header: 'Created',
                cell: (r: any) => <span className="text-muted-foreground text-sm">{formatDateTime(r.created_at)}</span>,
              },
              {
                key: 'last_used_at', header: 'Last Used',
                cell: (r: any) => r.last_used_at ? formatDateTime(r.last_used_at) : <span className="text-muted-foreground">Never</span>,
              },
              {
                key: 'status', header: 'Status',
                cell: (r: any) => r.revoked
                  ? <Badge variant="destructive">Revoked</Badge>
                  : <Badge variant="success">Active</Badge>,
              },
              {
                key: 'actions', header: '',
                cell: (r: any) => !r.revoked ? (
                  <Button variant="ghost" size="icon" onClick={() => handleRevoke(r.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                ) : null,
                className: 'w-16',
              },
            ]}
            data={keys ?? []}
            loading={isLoading}
            emptyMessage="No API keys created yet"
          />
        </CardContent>
      </Card>
    </div>
  )
}
