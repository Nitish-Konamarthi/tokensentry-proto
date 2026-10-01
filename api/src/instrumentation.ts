import { env } from './config/env.js'

if (env.NODE_ENV === 'production') {
  const dsn = process.env['SENTRY_DSN']
  if (dsn) {
    import('@sentry/node').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: env.NODE_ENV,
        tracesSampleRate: 0.1,
      })
    }).catch(() => {
      // Sentry is optional
    })
  }
}
