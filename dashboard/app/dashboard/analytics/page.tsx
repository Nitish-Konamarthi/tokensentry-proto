'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { SpendChart } from '@/components/charts/spend-chart'
import { ModelChart } from '@/components/charts/model-chart'
import { DataTable } from '@/components/data-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useSpendTimeSeries, useModelDistribution } from '@/lib/hooks'
import { formatUsd, formatCompact } from '@/lib/utils'

export default function UsageAnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data: spendData, isLoading: spendLoading } = useSpendTimeSeries(days)
  const { data: modelData, isLoading: modelLoading } = useModelDistribution(days)

  const totalCalls = spendData?.time_series?.reduce((s, d) => s + d.calls, 0) ?? 0
  const totalSpend = spendData?.time_series?.reduce((s, d) => s + d.spend_usd, 0) ?? 0
  const avgDailyCalls = spendData?.time_series?.length
    ? Math.round(totalCalls / spendData.time_series.length)
    : 0

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Usage Analytics" description="Detailed breakdown of AI API usage and traffic patterns">
        <div className="flex rounded-lg border p-0.5">
          {([7, 14, 30, 90] as const).map(d => (
            <button
              key={d}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard title="Total Calls" value={formatCompact(totalCalls)} loading={spendLoading} />
        <MetricCard title="Total Spend" value={formatUsd(totalSpend)} loading={spendLoading} />
        <MetricCard title="Avg Daily Calls" value={formatCompact(avgDailyCalls)} loading={spendLoading} />
        <MetricCard title="Models Used" value={String(modelData?.length ?? 0)} loading={modelLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-5">Daily Spend vs Savings ({days}d)</h3>
          <SpendChart data={spendData?.time_series ?? []} loading={spendLoading} />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-5">Model Distribution ({days}d)</h3>
          <ModelChart data={modelData ?? []} loading={modelLoading} />
        </div>
      </div>

      {/* Model breakdown table */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Model Breakdown</h3>
        <DataTable
          columns={[
            { key: 'model', header: 'Model', cell: (r: any) => r.model },
            { key: 'calls', header: 'Calls', cell: (r: any) => formatCompact(r.calls) },
            { key: 'cost_usd', header: 'Cost', cell: (r: any) => formatUsd(r.cost_usd) },
            { key: 'pct', header: '% of Spend', cell: (r: any) => `${r.pct.toFixed(1)}%` },
          ]}
          data={modelData ?? []}
          loading={modelLoading}
        />
      </div>
    </div>
  )
}
