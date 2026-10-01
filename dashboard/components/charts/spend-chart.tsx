'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DailyRow } from '../../lib/types'
import { formatUsd } from '../../lib/utils'

interface SpendChartProps {
  data: DailyRow[]
  loading?: boolean
}

function CustomTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !payload) return null
  const p = payload as Array<{ name: string; value: number; color: string }>
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5">{String(label)}</p>
      {p.map(entry => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-semibold">{formatUsd(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function SpendChart({ data, loading }: SpendChartProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          interval={Math.max(Math.floor(data.length / 6) - 1, 0)}
        />
        <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="spend_usd" name="Spend" stroke="#6366f1" fill="url(#gradSpend)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="saved_usd" name="Saved" stroke="#10b981" fill="url(#gradSaved)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
