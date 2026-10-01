import { PricingTable } from '../../components/pricing-table'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, usage-based pricing for TokenSentry. Start free, no credit card required. Save 50\u201380% on AI API costs.',
  openGraph: {
    title: 'Pricing | TokenSentry',
    description: 'Simple, usage-based pricing for AI cost governance.',
  },
}

function Navbar() {
  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="navbar-logo-icon">TS</div>
          TokenSentry
        </a>
        <div className="navbar-links">
          <a href="/#how-it-works">How It Works</a>
          <a href="/#features">Features</a>
          <a href="https://docs.tokensentry.ai">Docs</a>
          <a href="https://app.tokensentry.ai/login">Sign In</a>
          <a href="https://app.tokensentry.ai/signup" className="navbar-cta">Start Free</a>
        </div>
      </nav>
      <div className="navbar-spacer" />
    </>
  )
}

function PricingHeader() {
  return (
    <section style={{
      padding: '80px 24px 40px',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: 'clamp(32px, 5vw, 56px)',
        fontWeight: 900,
        color: '#fff',
        letterSpacing: '-0.02em',
        marginBottom: '16px',
      }}>
        Simple pricing. <span style={{
          background: 'linear-gradient(90deg, #6366f1, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>Real savings.</span>
      </h1>
      <p style={{
        fontSize: '18px',
        color: '#94a3b8',
        maxWidth: '600px',
        margin: '0 auto',
        lineHeight: 1.7,
      }}>
        Most customers save more than their subscription costs in the first month.
        Start free, no credit card required.
      </p>
    </section>
  )
}

function CompareSection() {
  return (
    <section className="section" style={{ background: '#12141a', padding: '80px 24px' }}>
      <div className="section-inner">
        <div className="section-label">ROI</div>
        <h2 className="section-title">What does a typical customer save?</h2>
        <p className="section-sub">
          Based on anonymized data from 200+ production deployments.
        </p>
        <div style={{
          maxWidth: '800px', margin: '0 auto',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', padding: '40px',
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Usage Level</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Without TokenSentry</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>With TokenSentry</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#34d399', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>You Save</th>
              </tr>
            </thead>
            <tbody>
              {[
                { level: 'Light (1M tok/mo)', without: '$300', with: '$49', save: '$251/mo (84%)' },
                { level: 'Moderate (10M tok/mo)', without: '$3,000', with: '$199', save: '$2,801/mo (93%)' },
                { level: 'Heavy (50M tok/mo)', without: '$15,000', with: '$999', save: '$14,001/mo (93%)' },
                { level: 'Enterprise (200M tok/mo)', without: '$60,000', with: 'Custom', save: 'Contact us' },
              ].map(row => (
                <tr key={row.level}>
                  <td style={{ padding: '14px 16px', color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{row.level}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: '#f87171', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{row.without}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{row.with}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: '#34d399', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{row.save}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginTop: '24px' }}>
          Estimated costs assume 70% Haiku / 20% Sonnet / 10% Opus split before optimization.
          Actual savings vary based on usage patterns.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-links">
          <a href="/">Home</a>
          <a href="/#features">Features</a>
          <a href="https://docs.tokensentry.ai">Documentation</a>
          <a href="https://docs.tokensentry.ai/api">API Reference</a>
          <a href="https://status.tokensentry.ai">Status</a>
          <a href="https://app.tokensentry.ai/contact">Contact</a>
        </div>
        <div className="footer-copy">
          &copy; {new Date().getFullYear()} TokenSentry. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

export default function PricingPage() {
  return (
    <main>
      <Navbar />
      <PricingHeader />
      <PricingTable />
      <CompareSection />
      <Footer />
    </main>
  )
}
