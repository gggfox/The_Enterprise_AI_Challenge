/**
 * Shared, infra-flavored error types.
 *
 * Per-service code declares its own domain-specific extensions and unions
 * them with the relevant subset of these. Every error in the system carries
 * a `reason` string discriminant that maps 1:1 to an HTTP status on the
 * Bridge and to a UI branch on the FE.
 */

export type AuthError =
  | { reason: 'unauthenticated' }
  | { reason: 'forbidden'; action: string; resource: string }

export type ValidationError = {
  reason: 'validation_failed'
  issues: readonly string[]
}

export type NotFoundError = {
  reason: 'not_found'
  resource: string
  id?: string
}

export type ConflictError = {
  reason: 'conflict'
  field: string
  message?: string
}

export type UpstreamError = {
  reason: 'upstream_failed'
  service: string
  status?: number
  message?: string
}

export type InternalError = {
  reason: 'internal'
  message?: string
}

/**
 * Convenience union covering every infra error this project defines.
 * Service handlers usually narrow to a specific subset; the Bridge's HTTP
 * mapper switches on the full union.
 */
export type AppError =
  | AuthError
  | ValidationError
  | NotFoundError
  | ConflictError
  | UpstreamError
  | InternalError

/**
 * Map a `reason` to an HTTP status code. The Bridge plugin uses this; the
 * FE can use the inverse if it wants a hand-rolled retry policy.
 */
export const REASON_TO_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  validation_failed: 422,
  not_found: 404,
  conflict: 409,
  upstream_failed: 502,
  internal: 500,
} as const satisfies Record<AppError['reason'], number>

export type AppErrorReason = AppError['reason']

export function statusForReason(reason: AppErrorReason): number {
  return REASON_TO_STATUS[reason]
}
