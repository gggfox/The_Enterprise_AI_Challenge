/**
 * Process-wide pino logger -- routes records to (a) stdout for dokploy /
 * docker logs, and (b) the OTel log bridge for OpenObserve. Mirror of the
 * pattern in `references/logisticsPractice/apps/api/src/logger.ts`.
 */

import { Writable } from 'node:stream'
import { SeverityNumber, logs } from '@opentelemetry/api-logs'
import { type Logger, multistream, pino } from 'pino'
import { config } from './config.js'

const isDev = config.nodeEnv !== 'production'

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    service: config.observability.service,
    service_version: config.observability.version,
    service_namespace: config.observability.namespace,
    deployment_region: config.observability.region,
  },
})

const PINO_TO_OTEL_SEV: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
}

const PINO_TO_TEXT: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
}

function tryParse(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function emitOtelRecord(
  otelLogger: ReturnType<typeof logs.getLogger>,
  rec: Record<string, unknown>,
  fallbackBody: string,
): void {
  const { level, time, msg, trace_id, span_id, trace_flags, ...attrs } = rec
  const levelNum = typeof level === 'number' ? level : 30
  const traceAttrs: Record<string, string> = {}
  if (typeof trace_id === 'string') traceAttrs.trace_id = trace_id
  if (typeof span_id === 'string') traceAttrs.span_id = span_id
  if (typeof trace_flags === 'string') traceAttrs.trace_flags = trace_flags

  // OTel's AnyValueMap forbids `unknown`. Stringify any nested object on
  // the way out so structured pino fields land in OpenObserve as strings
  // rather than getting dropped by the SDK's type guard.
  const flatAttrs: Record<string, string | number | boolean> = {
    ...traceAttrs,
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      flatAttrs[k] = v
    } else if (v !== null && v !== undefined) {
      flatAttrs[k] = JSON.stringify(v)
    }
  }

  otelLogger.emit({
    timestamp: typeof time === 'number' ? time : Date.now(),
    severityNumber: PINO_TO_OTEL_SEV[levelNum] ?? SeverityNumber.INFO,
    severityText: PINO_TO_TEXT[levelNum] ?? 'INFO',
    body: typeof msg === 'string' ? msg : fallbackBody,
    attributes: flatAttrs,
  })
}

function createOtelStream(): Writable {
  const otelLogger = logs.getLogger('apps/api/logger', '0.1.0')
  return new Writable({
    write(chunk, _enc, cb): void {
      const line = chunk.toString('utf8').trimEnd()
      if (line.length === 0) {
        cb()
        return
      }
      const rec = tryParse(line)
      if (rec) emitOtelRecord(otelLogger, rec, line)
      cb()
    },
  })
}

const streamSym = Object.getOwnPropertySymbols(baseLogger).find(
  (s) => s.description === 'pino.stream',
)
if (streamSym) {
  const loggerWithStream = baseLogger as unknown as Record<symbol, unknown>
  const origStream = loggerWithStream[streamSym] as NodeJS.WritableStream
  loggerWithStream[streamSym] = multistream(
    [
      { level: 0, stream: origStream },
      { level: 0, stream: createOtelStream() },
    ],
    { levels: baseLogger.levels.values },
  )
}

export const logger: Logger = baseLogger
