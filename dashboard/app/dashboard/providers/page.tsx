'use client'

import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Cloud } from 'lucide-react'
import { useProviderHealth } from '@/lib/hooks'

export default function ProvidersPage() {
  const { data, isLoading, isError } = useProviderHealth()

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Providers" description="Show whether provider credentials are configured on the API server" />

      {isLoading && <p className="text-sm text-muted-foreground">Loading provider configuration...</p>}
      {isError && <p className="text-sm text-red-400">Provider configuration could not be loaded.</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {data?.providers.map(provider => (
          <Card key={provider.provider}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-muted-foreground" />
                <CardTitle>{provider.name}</CardTitle>
              </div>
              <Badge variant={provider.configured ? 'success' : 'secondary'}>
                {provider.configured ? 'Credential configured' : 'Credential missing'}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This reports configuration presence only. It does not test provider connectivity or credentials.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}