'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { BudgetBar } from '@/components/budget-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgets, useUpdateBudget } from '@/lib/hooks'
import { formatUsd } from '@/lib/utils'

export default function BudgetsPage() {
  const { data, isLoading } = useBudgets()
  const updateBudget = useUpdateBudget()
  const policy = data?.policy

  const [monthlyLimit, setMonthlyLimit] = useState(policy?.monthly_limit_usd ?? 500)
  const [dailyLimit, setDailyLimit] = useState(policy?.daily_limit_usd ?? undefined)
  const [alert80, setAlert80] = useState(policy?.alert_at_80 ?? true)
  const [alert95, setAlert95] = useState(policy?.alert_at_95 ?? true)
  const [exhaustionAction, setExhaustionAction] = useState(policy?.on_exhaustion ?? 'block')

  const current = data?.current
  const monthlySpend = current?.this_month_usd ?? 0

  const handleSave = async () => {
    await updateBudget.mutateAsync({
      monthly_limit_usd: monthlyLimit,
      ...(dailyLimit ? { daily_limit_usd: dailyLimit } : {}),
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Budget Controls" description="Set and manage AI spending limits across your organization">
        <Button onClick={handleSave} disabled={updateBudget.isPending}>
          {updateBudget.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Monthly Spend" value={formatUsd(monthlySpend)} loading={isLoading} />
        <MetricCard title="Monthly Limit" value={formatUsd(policy?.monthly_limit_usd ?? 500)} loading={isLoading} />
        <MetricCard title="Remaining" value={formatUsd(Math.max((policy?.monthly_limit_usd ?? 500) - monthlySpend, 0))} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetBar current={monthlySpend} limit={policy?.monthly_limit_usd ?? 500} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Monthly Limit (USD)</label>
              <Input
                type="number"
                value={monthlyLimit}
                onChange={e => setMonthlyLimit(Number(e.target.value))}
                min={0}
                step={100}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Limit (USD, optional)</label>
              <Input
                type="number"
                value={dailyLimit ?? ''}
                onChange={e => setDailyLimit(e.target.value ? Number(e.target.value) : undefined)}
                min={0}
                step={10}
                placeholder="No daily limit"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">On Exhaustion</label>
            <Select
              value={exhaustionAction}
              onChange={e => setExhaustionAction(e.target.value)}
              options={[
                { value: 'block', label: 'Block requests' },
                { value: 'downgrade', label: 'Downgrade to cheapest model' },
                { value: 'warn', label: 'Warn only (don\'t block)' },
              ]}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Alert at 80%</p>
                <p className="text-xs text-muted-foreground">Send notification when budget is 80% utilized</p>
              </div>
              <Switch checked={alert80} onCheckedChange={setAlert80} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Alert at 95%</p>
                <p className="text-xs text-muted-foreground">Send critical alert when budget is 95% utilized</p>
              </div>
              <Switch checked={alert95} onCheckedChange={setAlert95} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
