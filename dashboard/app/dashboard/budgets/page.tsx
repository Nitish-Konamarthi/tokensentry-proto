'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { BudgetBar } from '@/components/budget-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgets, useUpdateBudget } from '@/lib/hooks'
import { formatUsd } from '@/lib/utils'

export default function BudgetsPage() {
  const { data, isLoading } = useBudgets()
  const updateBudget = useUpdateBudget()
  const policy = data?.policy

  const [monthlyLimit, setMonthlyLimit] = useState<number | ''>('')
  const [dailyLimit, setDailyLimit] = useState<number | ''>('')

  useEffect(() => {
    if (!policy) return
    setMonthlyLimit(policy.monthly_limit_usd)
    setDailyLimit(policy.daily_limit_usd ?? '')
  }, [policy])

  const current = data?.current
  const monthlySpend = current?.this_month_usd ?? 0

  const handleSave = async () => {
    await updateBudget.mutateAsync({
      monthly_limit_usd: Number(monthlyLimit),
      ...(dailyLimit !== '' ? { daily_limit_usd: Number(dailyLimit) } : {}),
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Budget Controls" description="Set and manage AI spending limits across your organization">
        <Button onClick={handleSave} disabled={updateBudget.isPending || monthlyLimit === '' || monthlyLimit <= 0}>
          {updateBudget.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Monthly Spend" value={formatUsd(monthlySpend)} loading={isLoading} />
        <MetricCard title="Monthly Limit" value={policy ? formatUsd(policy.monthly_limit_usd) : 'Not configured'} loading={isLoading} />
        <MetricCard title="Remaining" value={policy ? formatUsd(Math.max(policy.monthly_limit_usd - monthlySpend, 0)) : 'Not configured'} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          {policy ? <BudgetBar current={monthlySpend} limit={policy.monthly_limit_usd} /> : <p className="text-sm text-muted-foreground">No monthly budget is configured.</p>}
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
                onChange={e => setMonthlyLimit(e.target.value ? Number(e.target.value) : '')}
                min={0}
                step={100}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Limit (USD, optional)</label>
              <Input
                type="number"
                value={dailyLimit}
                onChange={e => setDailyLimit(e.target.value ? Number(e.target.value) : '')}
                min={0}
                step={10}
                placeholder="No daily limit"
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Requests are blocked when the configured organization budget is reached. V1 does not send budget threshold notifications.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
