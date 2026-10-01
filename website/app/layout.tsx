import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'TokenSentry — AI Cost Governance Platform', template: '%s | TokenSentry' },
  description: 'Enterprise AI cost governance. Route every AI call to the cheapest capable model, enforce hard budget limits, cache semantically, and stop runaway agents. Save 50–80% on AI API costs with one line of code.',
  keywords: ['AI token governance', 'AI cost optimization', 'Claude API proxy', 'enterprise AI budget', 'LLM cost management'],
  openGraph: {
    title: 'TokenSentry — Enterprise AI Token Governance',
    description: 'Save 50–80% on AI API costs with intelligent model routing and budget enforcement.',
    url: 'https://tokensentry.ai',
    siteName: 'TokenSentry',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
