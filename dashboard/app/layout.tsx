import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '../components/providers'

export const metadata: Metadata = {
  title: { default: 'TokenSentry V1 Dashboard', template: '%s | TokenSentry' },
  description: 'Administration dashboard for the TokenSentry V1 AI gateway.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
