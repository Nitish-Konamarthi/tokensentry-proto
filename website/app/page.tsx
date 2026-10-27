const features = [
  {
    title: 'Request governance',
    text: 'Authenticate callers, apply a shared request limit, enforce organization budgets, and check model policy before provider execution.',
  },
  {
    title: 'Provider routing',
    text: 'Route requests through provider adapters using the checked-in model catalog and deterministic policy.',
  },
  {
    title: 'Agent Guard',
    text: 'Track gateway-visible agent sessions and block sessions that cross configured behavior thresholds.',
  },
  {
    title: 'Usage and audit',
    text: 'Record provider usage and estimated cost, with a call ID returned in the x-call-id response header.',
  },
]

export default function HomePage() {
  return (
    <main className="site-main">
      <header className="site-header">
        <nav className="site-nav">
          <a href="/" className="site-brand">TokenSentry</a>
          <a href="#scope" className="site-nav-link">V1 scope</a>
        </nav>
      </header>

      <section className="site-hero">
        <p className="site-eyebrow">TokenSentry V1</p>
        <h1>A governance gateway for AI model requests</h1>
        <p className="site-lead">
          TokenSentry sits between an application and its model providers. It applies deterministic
          access, rate, budget, model, routing, and agent-session controls before forwarding requests.
        </p>
        <p className="site-copy">
          Clients send the supported request shape to POST /v1/proxy and authenticate with a
          TokenSentry API key. Provider credentials stay on the API server.
        </p>
      </section>

      <section id="scope" className="site-section">
        <div className="site-inner">
          <h2>Implemented V1 capabilities</h2>
          <div className="site-grid">
            {features.map(feature => (
              <article key={feature.title} className="site-card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-inner">
        <h2>V1 deployment shape</h2>
        <p>
          One Fastify API, PostgreSQL for durable data, and Valkey for shared atomic controls.
          The repository also contains a Next.js dashboard and single-host Docker Compose configuration.
        </p>
      </section>

      <footer className="site-footer">TokenSentry V1</footer>
    </main>
  )
}
