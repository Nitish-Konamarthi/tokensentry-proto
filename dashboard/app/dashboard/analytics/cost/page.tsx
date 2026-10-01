'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { MetricCard } from '@/components/metric-card'
import { DataTable } from '@/components/data-table'
import { useSpendDetail } from '@/lib/hooks'
import { formatUsd, formatCompact } from '@/lib/utils'

export default function CostAnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useSpendDetail(days)

  const totalCost = data?.current_month_total_usd ?? 0
  const totalCalls = data?.model_distribution?.reduce((s, m) => s + m.calls, 0) ?? 0
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0
  const topModel = data?.model_distribution?.[0]

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Cost Analytics" description="Breakdown of AI spending across models and time">
        <div className="flex rounded-lg border p-0.5">
          {([7, 30, 90] as const).map(d => (
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
        <MetricCard title="Current Month" value={formatUsd(totalCost)} loading={isLoading} />
        <MetricCard title="Total Calls" value={formatCompact(totalCalls)} loading={isLoading} />
        <MetricCard title="Avg Cost/Call" value={formatUsd(avgCostPerCall)} loading={isLoading} />
        <MetricCard
          title="Top Model"
          value={topModel?.model ?? '—'}
          subtitle={topModel ? `${formatUsd(topModel.cost_usd)} (${((topModel.cost_usd / (totalCost || 1)) * 100).toFixed(0)}%)` : undefined}
          loading={isLoading}
        />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Cost by Model</h3>
        <DataTable
          columns={[
            { key: 'model', header: 'Model', cell: (r: any) => r.model },
            { key: 'calls', header: 'Calls', cell: (r: any) => formatCompact(r.calls) },
            { key: 'cost_usd', header: 'Cost', cell: (r: any) => formatUsd(r.cost_usd) },
            {
              key: 'pct',
              header: '% of Total',
              cell: (r: any) => (
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden max-w-[120px]">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.cost_usd / (totalCost || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{((r.cost_usd / (totalCost || 1)) * 100).toFixed(1)}%</span>
                </div>
              ),
            },
          ]}
          data={data?.model_distribution ?? []}
          loading={isLoading}
        />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Daily Spend</h3>
        <DataTable
          columns={[
            { key: 'date', header: 'Date', cell: (r: any) => new Date(r.date).toLocaleDateString() },
            { key: 'spend_usd', header: 'Spend', cell: (r: any) => formatUsd(r.spend_usd) },
            { key: 'calls', header: 'Calls', cell: (r: any) => formatCompact(r.calls) },
            {
              key: 'avg',
              header: 'Avg Cost/Call',
              cell: (r: any) => r.calls > 0 ? formatUsd(r.spend_usd / r.calls) : '—',
            },
          ]}
          data={data?.time_series ?? []}
          loading={isLoading}
        />
      </div>
    </div>
  )
}
