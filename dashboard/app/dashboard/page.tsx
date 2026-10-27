'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { BudgetBar } from '@/components/budget-bar'
import { SpendChart } from '@/components/charts/spend-chart'
import { ModelChart } from '@/components/charts/model-chart'
import { Badge } from '@/components/ui/badge'
import { useRealtime, useSpendTimeSeries, useModelDistribution } from '@/lib/hooks'
import { formatUsd } from '@/lib/utils'

export default function OverviewPage() {
  const [period, setPeriod] = useState<7 | 30>(30)

  const { data: budgets, isLoading: budgetsLoading } = useRealtime()
  const { data: spendData, isLoading: spendLoading } = useSpendTimeSeries(period)
  const { data: modelData, isLoading: modelLoading } = useModelDistribution(period)

  const current = budgets?.current
  const policy = budgets?.policy
  const monthlyLimit = policy?.monthly_limit_usd
  const monthlySpend = current?.this_month_usd ?? 0
  const todaySpend = current?.today_usd ?? 0
  const utilizationPct = current?.utilization_pct ?? 0

  const totalCalls = spendData?.time_series?.reduce((sum, day) => sum + day.calls, 0) ?? 0

  const budgetStatus = !policy ? 'info' as const : utilizationPct < 80 ? 'success' as const : utilizationPct < 95 ? 'warning' as const : 'destructive' as const

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        description="Organization spend and gateway usage"
      >
        <div className="flex items-center gap-3">
          <Badge variant={budgetStatus}>
            ● {!policy ? 'No Limit' : utilizationPct < 80 ? 'Healthy' : utilizationPct < 95 ? 'Warning' : 'Critical'}
          </Badge>
          <div className="flex rounded-lg border p-0.5">
            {([7, 30] as const).map(p => (
              <button
                key={p}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setPeriod(p)}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="This Month"
          value={formatUsd(monthlySpend)}
          subtitle={monthlyLimit === undefined ? 'No monthly limit configured' : `of ${formatUsd(monthlyLimit)} limit`}
          loading={budgetsLoading}
        />
        <MetricCard
          title="Today"
          value={formatUsd(todaySpend)}
          loading={budgetsLoading}
        />
        <MetricCard
          title={`Calls (${period}d)`}
          value={totalCalls.toLocaleString()}
          loading={spendLoading}
        />
        <MetricCard
          title="Budget Remaining"
          value={monthlyLimit === undefined ? 'Not configured' : formatUsd(Math.max(monthlyLimit - monthlySpend, 0))}
          subtitle={monthlyLimit === undefined ? undefined : `${utilizationPct.toFixed(1)}% used`}
          loading={budgetsLoading}
        />
      </div>

      {/* Budget Bar */}
      {policy && <div className="rounded-xl border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Monthly Budget Utilization</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatUsd(monthlySpend)} of {formatUsd(policy.monthly_limit_usd)}
              {' · Resets '}
              {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString()}
            </p>
          </div>
          <span className="text-3xl font-bold">{utilizationPct.toFixed(1)}%</span>
        </div>
        <BudgetBar current={monthlySpend} limit={policy.monthly_limit_usd} />
      </div>}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-5">Daily Spend ({period}d)</h3>
          <SpendChart
            data={spendData?.time_series ?? []}
            loading={spendLoading}
          />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-5">Model Distribution ({period}d)</h3>
          <ModelChart
            data={modelData ?? []}
            loading={modelLoading}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-2">Proxy endpoint</h3>
        <p className="text-sm text-muted-foreground">
          Send a supported request body to POST /v1/proxy with a TokenSentry API key. Provider SDKs may require an adapter because the endpoint accepts a defined request subset.
        </p>
      </div>
    </div>
  )
}
