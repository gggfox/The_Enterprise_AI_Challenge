/**
 * Maps Result tuples and ConvexError-shaped throws to HTTP responses.
 *
 * Routes call `sendResult(reply, result)` which:
 *  - 2xx with the data on `ok`
 *  - status mapped from `reason` on `err`
 *
 * The error response body is `{ error: { reason, ...extra } }` so the FE
 * can pattern-match on `reason` directly.
 */

import {
  type AppError,
  type AppErrorReason,
  type Result,
  isErr,
  statusForReason,
} from '@enterprise-ai/shared'
import { ConvexError } from 'convex/values'
import type { FastifyReply } from 'fastify'

const KNOWN_REASONS: ReadonlySet<AppErrorReason> = new Set<AppErrorReason>([
  'unauthenticated',
  'forbidden',
  'validation_failed',
  'not_found',
  'conflict',
  'upstream_failed',
  'internal',
])

function isAppErrorReason(r: unknown): r is AppErrorReason {
  return typeof r === 'string' && KNOWN_REASONS.has(r as AppErrorReason)
}

export function sendResult<T>(
  reply: FastifyReply,
  result: Result<T, AppError>,
  okStatus = 200,
): FastifyReply {
  if (isErr(result)) {
    const error = result[0]
    return reply.code(statusForReason(error.reason)).send({ error })
  }
  return reply.code(okStatus).send({ data: result[1] })
}

/**
 * Translate a thrown `ConvexError` into an `AppError`. Convex public
 * functions throw with the same `reason` discriminant as the rest of
 * the system, so this is a structural pass-through plus a fallback
 * for anything unexpected.
 */
export function convexErrorToAppError(cause: unknown): AppError {
  if (cause instanceof ConvexError) {
    const data = cause.data as Record<string, unknown>
    if (isAppErrorReason(data.reason)) {
      return data as AppError
    }
    const msg = typeof data.reason === 'string' ? data.reason : undefined
    return {
      reason: 'upstream_failed',
      service: 'convex',
      ...(msg ? { message: msg } : {}),
    }
  }
  if (cause instanceof Error) {
    return {
      reason: 'upstream_failed',
      service: 'convex',
      ...(cause.message ? { message: cause.message } : {}),
    }
  }
  return { reason: 'internal' }
}
