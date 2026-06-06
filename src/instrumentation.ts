// src/instrumentation.ts
// OpenTelemetry — must be imported BEFORE anything else
// Sends traces to Grafana Tempo and metrics to Prometheus

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import * as Sentry from '@sentry/node'

// ── Sentry (error tracking) ────────────────────────────────
if (process.env['SENTRY_DSN']) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
  })
}

// ── OpenTelemetry SDK ──────────────────────────────────────
const traceExporter = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  ? new OTLPTraceExporter({
      url: `${process.env['OTEL_EXPORTER_OTLP_ENDPOINT']}/v1/traces`,
      headers: process.env['OTEL_EXPORTER_OTLP_HEADERS']
        ? Object.fromEntries(
            process.env['OTEL_EXPORTER_OTLP_HEADERS']
              .split(',')
              .map(h => h.split('=') as [string, string])
          )
        : {},
    })
  : undefined

const sdkConfig = {
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'tokensentry-api',
    [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env['NODE_ENV'] ?? 'development',
  }),
  // SECURITY: Bind to localhost only — not 0.0.0.0
  // This mitigates GHSA-q7rr-3cgh-j5r3 (Prometheus crash via malformed HTTP req)
  // by preventing external access. Only local Prometheus scraper can reach this port.
  metricReader: new PrometheusExporter({ port: 9090, endpoint: '/metrics', host: '127.0.0.1' }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  ...(traceExporter != null ? { traceExporter } : {}),
}

const sdk = new NodeSDK(sdkConfig)

sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
