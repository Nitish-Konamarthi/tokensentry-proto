import { Hero } from '../components/hero'
import { HowItWorks } from '../components/how-it-works'
import { PricingTable } from '../components/pricing-table'

function Navbar() {
  return (
    <>
      <nav className="navbar">
        <a href="/" className="navbar-logo">
          <div className="navbar-logo-icon">TS</div>
          TokenSentry
        </a>
        <div className="navbar-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="https://docs.tokensentry.ai">Docs</a>
          <a href="https://app.tokensentry.ai/login">Sign In</a>
          <a href="https://app.tokensentry.ai/signup" className="navbar-cta">Start Free</a>
        </div>
      </nav>
      <div className="navbar-spacer" />
    </>
  )
}

function Features() {
  const features = [
    { icon: '⚡', title: 'Hard Budget Enforcement', body: 'Atomic Valkey Lua counters track per-user, per-team, and per-org spend. Calls are blocked before they reach the provider — not after the bill arrives.' },
    { icon: '🛡️', title: 'Agentic Loop Guard', body: 'Monitors agent sessions for runaway token consumption, infinite loops, and budget violations. Terminates stuck agents automatically.' },
    { icon: '📊', title: 'Analytics & Audit Logging', body: 'Usage logs, routing decisions, and audit trails stored in PostgreSQL. Real-time spend counters via Valkey. No external analytics backend required for V1.' },
  ]

  return (
    <section className="section" style={{ background: 'linear-gradient(180deg, #0f0f1a 0%, #12141a 100%)' }} id="features">
      <div className="section-inner">
        <div className="section-label">Platform</div>
        <h2 className="section-title">V1 governance layers</h2>
        <p className="section-sub">
          Every component designed to reduce waste, enforce policy, and give you full visibility into AI spend.
        </p>
        <div className="feature-grid">
          {features.map(f => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Stats() {
  return (
    <section className="section" style={{ background: '#12141a', padding: '60px 24px' }}>
      <div className="section-inner">
        <div className="stats-row">
          {[
            { value: '50\u201380%', label: 'Average cost reduction' },
            { value: '10M+', label: 'Tokens analyzed daily' },
            { value: '99.99%', label: 'API uptime SLA' },
            { value: '<5ms', label: 'Proxy latency overhead' },
          ].map(s => (
            <div className="stat-item" key={s.label}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Faq() {
  const faqs = [
    { q: 'How is TokenSentry different from just choosing a cheaper model?', a: 'We enforce organizational model policies and cost-aware routing. Each call is routed to the cheapest allowed model based on your policy (e.g., Haiku for simple Q&A, Sonnet or Opus for complex tasks). The same conversation can mix different models per turn.' },
    { q: 'Do I need to change my application code?', a: 'One line: change your baseURL from api.anthropic.com to api.tokensentry.ai/v1/proxy. Your existing Anthropic SDK code works without any other modifications. We\'re a drop-in proxy.' },
    { q: 'Is my data secure?', a: 'Yes. API keys are validated via HMAC-SHA256 with a platform pepper. We don\'t log prompt contents. Budget enforcement uses Valkey atomic counters. No customer keys are stored on our servers.' },
    { q: 'What providers do you support?', a: 'Currently Anthropic Claude (Haiku, Sonnet, Opus). OpenAI GPT-4o and Google Gemini support are in beta \u2014 contact us to enable them for your organization.' },
    { q: 'How does caching work?', a: 'V1 uses basic Valkey key-value storage for session state and budget counters. Semantic similarity caching (pgvector) and exact prompt caching are deferred features.' },
    { q: 'What happens when we hit our budget limit?', a: 'The Atomic Governor blocks the call before it reaches the provider and returns a 429 response with clear details: which limit was hit, current spend, and a link to your dashboard. You can configure the action per policy \u2014 block, downgrade to Haiku, or notify only.' },
  ]

  return (
    <section className="section" style={{ background: '#0f0f1a' }} id="faq">
      <div className="section-inner">
        <div className="section-label">FAQ</div>
        <h2 className="section-title">Frequently asked questions</h2>
        <p className="section-sub">
          Everything you need to know about TokenSentry.
        </p>
        <div className="faq-list">
          {faqs.map(f => (
            <details className="faq-item" key={f.q}>
              <summary className="faq-q">
                {f.q}
                <span style={{ fontSize: '20px', color: '#64748b' }}>+</span>
              </summary>
              <div className="faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
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

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Features />
      <Stats />
      <div id="how-it-works"><HowItWorks /></div>
      <div id="pricing"><PricingTable /></div>
      <Faq />
      <Footer />
    </main>
  )
}
