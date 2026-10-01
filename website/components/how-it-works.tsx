export function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Point SDK at TokenSentry',
      body: 'Change one line \u2014 your baseURL. All AI traffic now flows through TokenSentry before reaching providers.',
      code: 'baseURL: "https://api.tokensentry.ai/v1/proxy"',
    },
    {
      n: '02',
      title: 'Every call is classified + optimized',
      body: 'TokenSentry\'s AI classifier routes to the cheapest capable model. The prompt optimizer strips 30\u201370% of tokens. If an identical query was answered before, the cached response is returned instantly \u2014 zero tokens.',
      code: 'X-TS-Approved-Model: claude-haiku-4-5',
    },
    {
      n: '03',
      title: 'Budget enforced at the gate',
      body: 'Atomic Redis counters track per-user, per-team, and per-org spend in real time. Hard limits block overspend before the API call is made \u2014 not after the bill arrives.',
      code: '{"error":"BUDGET_EXCEEDED","limit":500,"current":499.99}',
    },
    {
      n: '04',
      title: 'Watch savings compound on the dashboard',
      body: 'Every dollar saved, every cache hit, every routing decision \u2014 visible in your dashboard. CFOs get one-question answers. Agents get loop protection. FinOps teams get weekly reports.',
      code: 'Saved $2,841 this month vs unrestricted usage',
    },
  ]

  return (
    <section className="section" style={{ background: '#fff' }}>
      <div className="section-inner">
        <h2 className="section-title" style={{ color: '#0f0f1a' }}>
          How it works
        </h2>
        <p className="section-sub" style={{ color: '#64748b' }}>
          Four layers of governance between your team and runaway AI bills.
        </p>
        <div className="feature-grid">
          {steps.map(step => (
            <div key={step.n} style={{
              border: '1px solid #e2e8f0', borderRadius: '12px',
              padding: '28px',
            }}>
              <div style={{
                fontSize: '13px', fontWeight: 700, color: '#6366f1',
                letterSpacing: '1px', marginBottom: '12px',
              }}>{step.n}</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
                {step.title}
              </h3>
              <p style={{ color: '#64748b', lineHeight: 1.7, fontSize: '14px', margin: '0 0 16px' }}>
                {step.body}
              </p>
              <code style={{
                background: '#f8fafc', display: 'block', padding: '8px 12px',
                borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace',
                color: '#334155', border: '1px solid #e2e8f0',
              }}>{step.code}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
