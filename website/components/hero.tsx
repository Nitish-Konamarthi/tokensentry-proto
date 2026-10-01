'use client'

export function Hero() {
  return (
    <section style={{
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '99px', padding: '6px 16px', marginBottom: '32px',
      }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
        <span style={{ color: '#a5b4fc', fontSize: '13px', fontWeight: 500 }}>
          Uber burned its 2026 AI budget in 4 months. We fix that.
        </span>
      </div>

      <h1 style={{
        fontSize: 'clamp(36px, 6vw, 72px)',
        fontWeight: 900,
        color: '#fff',
        lineHeight: 1.1,
        maxWidth: '900px',
        margin: '0 0 24px',
        letterSpacing: '-0.02em',
      }}>
        Your AI bill shouldn&apos;t grow{' '}
        <span style={{
          background: 'linear-gradient(90deg, #6366f1, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>13&times; in 4 months.</span>
      </h1>

      <p style={{
        fontSize: '20px', color: '#94a3b8', maxWidth: '640px',
        lineHeight: 1.7, margin: '0 0 48px',
      }}>
        TokenSentry routes every AI call to the cheapest capable model,
        enforces hard budget limits, and stops runaway agents &mdash; with
        one line of code.
      </p>

      <div className="code-demo" style={{ maxWidth: '580px', width: '100%', margin: '0 0 48px' }}>
        <div className="del">- apiKey: process.env.ANTHROPIC_API_KEY</div>
        <div className="add">+ apiKey: process.env.TOKENSENTRY_KEY</div>
        <div className="add">+ baseURL: &quot;https://api.tokensentry.ai/v1/proxy&quot;</div>
      </div>

      <div className="stats-row" style={{ marginBottom: '48px' }}>
        {[
          { value: '50\u201380%', label: 'cost reduction' },
          { value: '94%',    label: 'of calls rerouted cheaper' },
          { value: '100%',   label: 'token savings on cache hits' },
        ].map(s => (
          <div className="stat-item" key={s.label}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="cta-row">
        <a href="https://app.tokensentry.ai/signup" className="cta-primary">
          Start Free &mdash; No Card
        </a>
        <a href="https://docs.tokensentry.ai/quickstart" className="cta-secondary">
          Read the Docs
        </a>
      </div>
    </section>
  )
}
