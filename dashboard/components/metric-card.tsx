'use client'

import { cn } from '../lib/utils'
import { Skeleton } from './ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  loading?: boolean
  className?: string
  children?: React.ReactNode
  icon?: React.ReactNode
}

export function MetricCard({ title, value, subtitle, trend, trendLabel, loading, className, children, icon }: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn('metric-card', className)}>
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    )
  }

  const trendIcon = trend === 'up' ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
    : trend === 'down' ? <TrendingDown className="h-3.5 w-3.5 text-red-400" />
    : <Minus className="h-3.5 w-3.5 text-muted-foreground" />

  return (
    <div className={cn('metric-card', className)}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">{icon}{title}</p>
        {trend && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {trendIcon}
            {trendLabel && <span>{trendLabel}</span>}
          </div>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {children}
    </div>
  )
}
