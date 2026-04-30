/**
 * OpenTelemetry Node SDK bootstrap.
 *
 * Imported FIRST in `server.ts` so auto-instrumentations patch every
 * subsequently imported module. OpenObserve accepts standard OTLP/HTTP at
 * `:5081`, with each exporter appending `/v1/traces`, `/v1/metrics`, or
 * `/v1/logs` to the base URL automatically.
 *
 * Adapted from `references/logisticsPractice/apps/api/src/otel.ts`.
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { config } from './config.js'

let sdk: NodeSDK | null = null

function buildSdk(): NodeSDK {
  const base = config.observability.otelEndpoint
  const headers = config.observability.otelHeaders

  const traceExporter = new OTLPTraceExporter({
    url: `${base}/v1/traces`,
    headers,
  })
  const metricExporter = new OTLPMetricExporter({
    url: `${base}/v1/metrics`,
    headers,
  })
  const logExporter = new OTLPLogExporter({
    url: `${base}/v1/logs`,
    headers,
  })

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30_000,
  })

  const logRecordProcessors: LogRecordProcessor[] = [
    new BatchLogRecordProcessor(logExporter),
  ]

  return new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.observability.service,
      [ATTR_SERVICE_VERSION]: config.observability.version,
      'service.namespace': config.observability.namespace,
      'deployment.environment': config.observability.namespace,
      'deployment.region': config.observability.region,
    }),
    traceExporter,
    metricReader,
    logRecordProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
      new PinoInstrumentation(),
    ],
  })
}

if (config.observability.otelEnabled) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)
  sdk = buildSdk()
  sdk.start()
}

export async function shutdownOtel(): Promise<void> {
  if (!sdk) return
  try {
    await sdk.shutdown()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[otel] shutdown failed', err)
  }
}
