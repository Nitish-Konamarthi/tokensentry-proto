'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useSettings, useUpdateSettings } from '@/lib/hooks'

interface ModelPolicy {
  allowed_models?: string[]
  max_model_tier?: string
  require_classification?: boolean
  enable_semantic_cache?: boolean
  enable_prompt_optimizer?: boolean
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()

  const [orgName, setOrgName] = useState('')
  const [semanticCache, setSemanticCache] = useState(false)
  const [promptOptimizer, setPromptOptimizer] = useState(false)
  const [requireClassification, setRequireClassification] = useState(true)

  useEffect(() => {
    if (settings) {
      setOrgName(settings.name ?? '')
      const policy = settings.model_policy as ModelPolicy | null
      setSemanticCache(policy?.enable_semantic_cache ?? false)
      setPromptOptimizer(policy?.enable_prompt_optimizer ?? false)
      setRequireClassification(policy?.require_classification ?? true)
    }
  }, [settings])

  function handleSave() {
    updateSettings.mutate({
      name: orgName,
      model_policy: {
        enable_semantic_cache: semanticCache,
        enable_prompt_optimizer: promptOptimizer,
        require_classification: requireClassification,
        allowed_models: (settings?.model_policy as ModelPolicy | null)?.allowed_models ?? [],
        max_model_tier: (settings?.model_policy as ModelPolicy | null)?.max_model_tier ?? 'sonnet',
      },
    })
  }

  const hasChanges = settings && (
    orgName !== (settings.name ?? '')
    || semanticCache !== ((settings.model_policy as ModelPolicy | null)?.enable_semantic_cache ?? false)
    || promptOptimizer !== ((settings.model_policy as ModelPolicy | null)?.enable_prompt_optimizer ?? false)
    || requireClassification !== ((settings.model_policy as ModelPolicy | null)?.require_classification ?? true)
  )

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Settings" description="Manage organization settings and preferences" />

      {/* Organization */}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your organization details on the TokenSentry platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Organization Name</label>
              <Input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Plan</label>
              <Input
                value={settings?.plan ? settings.plan.charAt(0).toUpperCase() + settings.plan.slice(1) : 'Starter'}
                disabled
                className="opacity-60"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Governance */}
      <Card>
        <CardHeader>
          <CardTitle>AI Governance</CardTitle>
          <CardDescription>Configure how TokenSentry routes and optimizes your AI calls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Semantic Cache</p>
              <p className="text-xs text-muted-foreground">Cache semantically similar prompts to reduce costs (Tier 2)</p>
            </div>
            <Switch checked={semanticCache} onCheckedChange={setSemanticCache} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Prompt Optimizer</p>
              <p className="text-xs text-muted-foreground">Optimize prompts before sending to reduce token usage</p>
            </div>
            <Switch checked={promptOptimizer} onCheckedChange={setPromptOptimizer} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require Classification</p>
              <p className="text-xs text-muted-foreground">Always classify task complexity before model selection</p>
            </div>
            <Switch checked={requireClassification} onCheckedChange={setRequireClassification} />
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-500/20">
        <CardHeader>
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions — proceed with caution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reset Monthly Budget</p>
              <p className="text-xs text-muted-foreground">Reset all budget counters for the current month</p>
            </div>
            <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">Reset</Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Organization</p>
              <p className="text-xs text-muted-foreground">Permanently delete your organization and all data</p>
            </div>
            <Button variant="destructive">Delete Organization</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
