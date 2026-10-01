'use client'

import { cn } from '../lib/utils'
import { Progress } from './ui/progress'

interface BudgetBarProps {
  current: number
  limit: number
  className?: string
}

export function BudgetBar({ current, limit, className }: BudgetBarProps) {
  const utilization = limit > 0 ? (current / limit) * 100 : 0
  const variant = utilization < 80 ? 'success' : utilization < 95 ? 'warning' : 'danger'

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">${current.toFixed(2)} of ${limit.toFixed(2)}</span>
        <span className={cn(
          'font-semibold',
          variant === 'danger' && 'text-red-400',
          variant === 'warning' && 'text-amber-400',
          variant === 'success' && 'text-emerald-400',
        )}>
          {utilization.toFixed(1)}%
        </span>
      </div>
      <Progress value={utilization} variant={variant} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>$0</span>
        <span className="text-amber-500/70">80%</span>
        <span className="text-red-500/70">95%</span>
        <span>${limit.toFixed(0)}</span>
      </div>
    </div>
  )
}
