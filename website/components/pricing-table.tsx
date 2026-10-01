const PLANS = [
  {
    name: 'Starter',
    desc: 'For small teams getting started with AI cost governance.',
    price: '$49',
    period: '/month',
    savings: 'Save ~$200/mo',
    features: [
      'Up to 5 team members',
      '1M tokens/month included',
      'Intelligent model routing',
      'Basic analytics dashboard',
      'Email alerts at 80%/95%',
      'Community support',
    ],
    cta: 'Start Free Trial',
    href: 'https://app.tokensentry.ai/signup?plan=starter',
  },
  {
    name: 'Business',
    desc: 'For growing teams that need granular budget controls.',
    price: '$199',
    period: '/month',
    savings: 'Save ~$2,500/mo',
    featured: true,
    features: [
      'Unlimited team members',
      '10M tokens/month included',
      'Everything in Starter',
      'Per-team & per-user budgets',
      'AI waste analysis reports',
      'Slack & webhook alerts',
      'Weekly email reports',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    href: 'https://app.tokensentry.ai/signup?plan=business',
  },
  {
    name: 'Enterprise',
    desc: 'For organizations with advanced security and compliance needs.',
    price: '$999',
    period: '/month',
    savings: 'Custom pricing available',
    features: [
      'Everything in Business',
      '50M tokens/month included',
      'Custom model policies',
      'SSO / SAML / SCIM',
      'SOC 2 compliance reports',
      'On-premise deployment option',
      'Dedicated infrastructure',
      '99.99% SLA',
      'Custom integrations',
      'Dedicated support engineer',
      'Quarterly business reviews',
    ],
    cta: 'Contact Sales',
    href: 'https://app.tokensentry.ai/contact?plan=enterprise',
  },
]

export function PricingTable() {
  return (
    <section className="section" style={{ background: '#0f0f1a' }}>
      <div className="section-inner">
        <div className="section-label">Pricing</div>
        <h2 className="section-title">Simple, usage-based pricing</h2>
        <p className="section-sub">
          Start free. No credit card required. Save more than your subscription costs or we&apos;ll make it right.
        </p>
        <div className="pricing-grid">
          {PLANS.map(plan => (
            <div key={plan.name} className={`pricing-card${plan.featured ? ' featured' : ''}`}>
              {plan.featured && <div className="pricing-badge">Most Popular</div>}
              <div className="pricing-name">{plan.name}</div>
              <div className="pricing-desc">{plan.desc}</div>
              <div className="pricing-price">
                <span className="pricing-amount">{plan.price}</span>
                <span className="pricing-period">{plan.period}</span>
              </div>
              <div className="pricing-savings">{plan.savings}</div>
              <ul className="pricing-features">
                {plan.features.map(f => (
                  <li key={f}>
                    <span className="check">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <a href={plan.href} className="cta-primary" style={{ display: 'block', textAlign: 'center' }}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '40px' }}>
          All plans include a 14-day free trial. No credit card required.
          Overage at $0.01/1K tokens after included quota.
        </p>
      </div>
    </section>
  )
}
