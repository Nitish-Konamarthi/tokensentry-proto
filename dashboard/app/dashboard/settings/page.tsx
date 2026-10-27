'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useSettings, useUpdateSettings } from '@/lib/hooks'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    if (settings) setOrgName(settings.name ?? '')
  }, [settings])

  const hasChanges = settings && orgName !== settings.name

  function handleSave() {
    updateSettings.mutate({ name: orgName })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Settings" description="Update your organization name" />
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Change the name associated with this organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="organization-name">Organization Name</label>
            <Input
              id="organization-name"
              value={orgName}
              onChange={event => setOrgName(event.target.value)}
              disabled={isLoading || updateSettings.isPending}
            />
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}