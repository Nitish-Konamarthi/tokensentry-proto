'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { cn } from '../../lib/utils'
import {
  LayoutDashboard, BarChart3, DollarSign, Wallet, Key,
  Cloud, Users, Shield, Bot, Settings, ChevronRight, LogOut,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/analytics', label: 'Usage Analytics', icon: BarChart3 },
  { href: '/dashboard/analytics/cost', label: 'Cost Analytics', icon: DollarSign },
  { href: '/dashboard/budgets', label: 'Budget Controls', icon: Wallet },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: Key },
  { href: '/dashboard/providers', label: 'Providers', icon: Cloud },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/audit-log', label: 'Audit Logs', icon: Shield },
  { href: '/dashboard/agent-guard', label: 'Agent Guard', icon: Bot },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isLoading } = useUser()

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? 'AC'

  const displayName = user?.name ?? user?.email ?? 'User'
  const userEmail = user?.email

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-sidebar hidden lg:flex flex-col">
        <div className="flex items-center gap-3 px-6 h-14 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">TS</span>
          </div>
          <div>
            <p className="text-sm font-semibold">TokenSentry</p>
            <p className="text-[11px] text-sidebar-muted">AI Governance Platform</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && '!bg-primary/10 !text-primary',
                )}
                data-active={isActive}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-primary" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
              {isLoading ? '..' : initials}
            </div>
            <div className="text-xs min-w-0">
              <p className="font-medium text-sidebar-foreground truncate">{isLoading ? 'Loading...' : displayName}</p>
              <p className="text-sidebar-muted truncate">{userEmail ?? ''}</p>
            </div>
          </div>
          <a
            href="/api/auth/logout"
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </a>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">TS</span>
            </div>
            <span className="text-sm font-semibold">TokenSentry</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/auth/logout"
              className="h-8 w-8 rounded-md border flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </a>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
