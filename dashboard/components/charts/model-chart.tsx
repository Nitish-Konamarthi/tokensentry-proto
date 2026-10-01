'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { ModelRow } from '../../lib/types'
import { modelShortName, MODEL_COLORS } from '../../lib/utils'

interface ModelChartProps {
  data: ModelRow[]
  loading?: boolean
}

export function ModelChart({ data, loading }: ModelChartProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const slices = data.map(m => ({
    name: modelShortName(m.model),
    value: Math.round(m.pct),
    color: MODEL_COLORS[m.model] ?? '#64748b',
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={slices}
            cx="50%" cy="50%"
            innerRadius={60} outerRadius={90}
            dataKey="value" paddingAngle={3}
          >
            {slices.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [`${v}%`, 'Calls']}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>{value}</span>
            )}
            iconType="circle" iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {slices.map(m => (
          <span
            key={m.name}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ background: m.color + '20', color: m.color }}
          >
            {m.name} {m.value}%
          </span>
        ))}
      </div>
    </div>
  )
}
