'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { BudgetBar } from '@/components/budget-bar'
import { SpendChart } from '@/components/charts/spend-chart'
import { ModelChart } from '@/components/charts/model-chart'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRealtime, useSpendTimeSeries, useModelDistribution } from '@/lib/hooks'
import { formatUsd, formatCompactCurrency } from '@/lib/utils'

export default function OverviewPage() {
  const [period, setPeriod] = useState<7 | 30>(30)

  const { data: budgets, isLoading: budgetsLoading } = useRealtime()
  const { data: spendData, isLoading: spendLoading } = useSpendTimeSeries(period)
  const { data: modelData, isLoading: modelLoading } = useModelDistribution(period)

  const current = budgets?.current
  const policy = budgets?.policy
  const monthlyLimit = policy?.monthly_limit_usd ?? 500
  const monthlySpend = current?.this_month_usd ?? 0
  const todaySpend = current?.today_usd ?? 0
  const utilizationPct = current?.utilization_pct ?? 0

  const totalSaved = spendData?.time_series?.reduce((s, d) => s + d.saved_usd, 0) ?? 0
  const totalSpend = spendData?.time_series?.reduce((s, d) => s + d.spend_usd, 0) ?? 0
  const savingsRate = totalSaved + totalSpend > 0
    ? Math.round((totalSaved / (totalSaved + totalSpend)) * 100)
    : 0

  const budgetStatus = utilizationPct < 80 ? 'success' as const : utilizationPct < 95 ? 'warning' as const : 'destructive' as const

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        description="Real-time AI spend and governance metrics"
      >
        <div className="flex items-center gap-3">
          <Badge variant={budgetStatus}>
            ● {utilizationPct < 80 ? 'Healthy' : utilizationPct < 95 ? 'Warning' : 'Critical'}
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
          <Button variant="outline" size="sm">Export</Button>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="This Month"
          value={formatUsd(monthlySpend)}
          subtitle={`of ${formatUsd(monthlyLimit)} budget`}
          loading={budgetsLoading}
        />
        <MetricCard
          title="Today"
          value={formatUsd(todaySpend)}
          subtitle={todaySpend < 20 ? '↓ Under daily average' : '↑ Above daily average'}
          trend={todaySpend < 50 ? 'down' : 'up'}
          loading={budgetsLoading}
        />
        <MetricCard
          title={`Saved (${period}d)`}
          value={formatUsd(totalSaved)}
          subtitle={`${savingsRate}% savings rate`}
          trend="up"
          loading={spendLoading}
        />
        <MetricCard
          title="Budget Remaining"
          value={formatUsd(Math.max(monthlyLimit - monthlySpend, 0))}
          subtitle={`${utilizationPct.toFixed(1)}% used`}
          loading={budgetsLoading}
        />
      </div>

      {/* Budget Bar */}
      <div className="rounded-xl border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Monthly Budget Utilization</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatUsd(monthlySpend)} of {formatUsd(monthlyLimit)}
              {' · Resets '}
              {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString()}
            </p>
          </div>
          <span className="text-3xl font-bold">{utilizationPct.toFixed(1)}%</span>
        </div>
        <BudgetBar current={monthlySpend} limit={monthlyLimit} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-5">Daily Spend vs Savings ({period}d)</h3>
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

      {/* Quick Start */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">
          One Line to Integrate
          <Badge className="ml-3 align-middle" variant="info">Quick Start</Badge>
        </h3>
        <div className="rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-muted-foreground">
            <span className="line-through text-red-400/60">{'- new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })'}</span>
            {'\n'}
            <span className="text-emerald-400">{'+ new Anthropic({ apiKey: process.env.TOKENSENTRY_KEY,'}</span>
            {'\n'}
            <span className="text-emerald-400">{'               baseURL: "https://api.tokensentry.ai/v1/proxy" })'}</span>
          </pre>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>✓ Tier 0 exact match cache</span>
          <span>✓ Tier 1 native prompt cache</span>
          <span>✓ Budget hard-blocked at configured limit</span>
        </div>
      </div>
    </div>
  )
}
