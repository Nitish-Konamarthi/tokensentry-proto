import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TokenSentry V1 - AI Governance Gateway',
  description: 'A self-hosted gateway for request authentication, rate limits, organization budgets, model policy, routing, Agent Guard, and usage accounting.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}