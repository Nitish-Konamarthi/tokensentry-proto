// src/emails/upgrade-nudge.tsx — Day 21 upgrade nudge (§E8)
// Sent when starter plan user approaches limits or reaches significant savings
import * as React from 'react'

interface UpgradeNudgeProps {
  firstName: string
  orgName: string
  totalSaved: number
  blockedCalls: number
  currentPlan: 'starter' | 'business'
  dashboardUrl: string
}

export function UpgradeNudgeEmail({
  firstName, orgName, totalSaved, blockedCalls, currentPlan, dashboardUrl,
}: UpgradeNudgeProps) {
  const targetPlan = currentPlan === 'starter' ? 'Business' : 'Enterprise'
  const priceText = currentPlan === 'starter' ? '$79/month' : '$399/month'

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb', margin: 0 }}>
        <div style={{ maxWidth: '560px', margin: '40px auto', padding: '32px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '8px', padding: '24px', textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚀</div>
            <div style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>
              Time to level up, {firstName}
            </div>
            <div style={{ color: '#c4b5fd', fontSize: '14px', marginTop: '4px' }}>
              {orgName} is growing fast
            </div>
          </div>

          <p style={{ color: '#374151', lineHeight: '1.7' }}>
            In your first 3 weeks, <strong>{orgName}</strong> has saved{' '}
            <strong style={{ color: '#10b981' }}>${totalSaved.toFixed(2)}</strong> on AI costs.
            {blockedCalls > 0 && (
              <span>
                {' '}You've also had <strong>{blockedCalls} calls blocked</strong> by your current plan's
                model restrictions.
              </span>
            )}
          </p>

          {/* Comparison */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', margin: '20px 0' }}>
            <div style={{ background: '#f8fafc', padding: '12px 16px', fontWeight: 600, fontSize: '13px', color: '#374151' }}>
              What you get on {targetPlan} ({priceText})
            </div>
            {[
              'Opus model access (unrestricted)',
              'Per-team budget policies with separate limits',
              'Slack + PagerDuty real-time alerts',
              'Priority support with &lt;2h response time',
              'Custom model routing rules',
              currentPlan === 'starter' ? '10× higher API rate limits' : 'Dedicated infrastructure (no shared limits)',
            ].map((feature, i) => (
              <div key={i} style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', fontSize: '14px', color: '#374151' }}>
                ✓ {feature}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <a href={`https://app.tokensentry.ai/billing/upgrade?plan=${targetPlan.toLowerCase()}`} style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', padding: '14px 32px', borderRadius: '8px',
              textDecoration: 'none', fontWeight: 700, fontSize: '16px',
            }}>
              Upgrade to {targetPlan} →
            </a>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '12px' }}>
              Cancel anytime. Billed monthly. No lock-in.
            </div>
          </div>

          <hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0, textAlign: 'center' }}>
            <a href={dashboardUrl} style={{ color: '#6366f1' }}>View Dashboard</a> ·
            {' '}<a href="https://app.tokensentry.ai/settings/notifications" style={{ color: '#6366f1' }}>Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
  )
}
