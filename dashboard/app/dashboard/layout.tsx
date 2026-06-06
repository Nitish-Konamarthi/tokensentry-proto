// dashboard/app/dashboard/layout.tsx
// Shared dashboard layout: sidebar + main content

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Dashboard' }

const NAV_ITEMS = [
  { href: '/dashboard',           label: 'Overview',    icon: '⬡' },
  { href: '/dashboard/analytics', label: 'Analytics',   icon: '⠿' },
  { href: '/dashboard/budgets',   label: 'Budgets',     icon: '◈' },
  { href: '/dashboard/api-keys',  label: 'API Keys',    icon: '⬤' },
  { href: '/dashboard/advisor',   label: 'AI Advisor',  icon: '◎' },
  { href: '/dashboard/settings',  label: 'Settings',    icon: '◇' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <Link href="/dashboard" className="logo">
          <div className="logo-icon">🛡</div>
          <span className="logo-text">TokenSentry</span>
        </Link>
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} className="nav-item">
              <span className="icon" style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '4px' }}>Acme Corp · Business Plan</div>
            <a href="https://app.tokensentry.ai/billing" style={{ color: 'var(--indigo-light)', textDecoration: 'none', fontSize: '11px' }}>
              Manage billing →
            </a>
          </div>
        </div>
      </aside>
      <main className="main-content animate-in">
        {children}
      </main>
    </div>
  )
}
