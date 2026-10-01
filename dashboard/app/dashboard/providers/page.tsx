'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Cloud, CheckCircle, XCircle } from 'lucide-react'
import { useProviderHealth, useUpdateProviderKeys } from '@/lib/hooks'

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', models: ['Claude Haiku', 'Claude Sonnet', 'Claude Opus'] },
  { id: 'openai', name: 'OpenAI', models: ['GPT-4o', 'GPT-4o-mini', 'GPT-4.1', 'o3', 'o4-mini'] },
  { id: 'gemini', name: 'Gemini', models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash'] },
  { id: 'groq', name: 'Groq', models: ['Llama 3', 'Mixtral'] },
]

export default function ProvidersPage() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})

  const { data: health, isLoading } = useProviderHealth()
  const updateKeys = useUpdateProviderKeys()

  const configured = new Set(
    health?.providers?.filter(p => p.configured).map(p => p.provider) ?? [],
  )

  function handleSave(providerId: string) {
    const key = apiKeys[providerId]
    if (key) {
      updateKeys.mutate({ [providerId]: key })
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Providers" description="Configure AI provider API keys and monitor health" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PROVIDERS.map(provider => {
          const isConfigured = configured.has(provider.id)
          return (
            <Card key={provider.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>{provider.name}</CardTitle>
                </div>
                <Badge variant={isConfigured ? 'success' : 'secondary'}>
                  {isConfigured ? 'Configured' : 'Not Set'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">API Key</label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={isConfigured ? '••••••••••' : 'sk-...'}
                      value={apiKeys[provider.id] ?? ''}
                      onChange={e => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSave(provider.id)}
                      disabled={!apiKeys[provider.id] || updateKeys.isPending}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Available Models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.models.map(m => (
                      <span key={m} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
                  {isConfigured ? (
                    <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /><span>Configured and ready</span></>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-muted-foreground" /><span>No API key set</span></>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
