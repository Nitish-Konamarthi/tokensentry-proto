// src/otel.ts
// OpenTelemetry MUST be initialized before any other import.
// It instruments HTTP, PostgreSQL, Redis, etc. automatically.
// NOTE: The actual OTel implementation lives in src/instrumentation.ts which is
// imported first in src/index.ts. This file re-exports the custom metrics
// so pillars can import from '@/otel' or './otel' as the spec describes.

import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { metrics } from '@opentelemetry/api'

// Only initialize if instrumentation.ts hasn't already started an SDK
// (prevents "SDK already started" error in production)
const alreadyStarted = !!(globalThis as Record<string, unknown>)['__ts_otel_started']

if (!alreadyStarted) {
  (globalThis as Record<string, unknown>)['__ts_otel_started'] = true

  const sdkConfig: Partial<NodeSDKConfiguration> = {
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]:    'tokensentry-api',
      [SEMRESATTRS_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.1',
    }),
    metricReader: new PrometheusExporter({ port: 9090, preventServerStart: false }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // Too noisy
      }),
    ],
  }

  // Only set traceExporter if endpoint is configured — avoids exactOptionalPropertyTypes error
  if (process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
    sdkConfig.traceExporter = new OTLPTraceExporter()
  }

  const sdk = new NodeSDK(sdkConfig)
  sdk.start()
}

// Custom TokenSentry metrics (imported by pillars)
const meter = metrics.getMeter('tokensentry')

export const metrics_ts = {
  tokensConsumed:  meter.createCounter('tokensentry.tokens.consumed'),
  tokensSaved:     meter.createCounter('tokensentry.tokens.saved'),
  cacheHits:       meter.createCounter('tokensentry.cache.hits'),
  budgetBlocked:   meter.createCounter('tokensentry.budget.blocked'),
  agentTerminated: meter.createCounter('tokensentry.agent.terminated'),
  callDuration:    meter.createHistogram('tokensentry.call.duration_ms'),
  // Note: histogram boundaries are set via OTel view configuration, not MetricOptions
  budgetUtil:      meter.createHistogram('tokensentry.budget.utilization'),
}
