/**
 * Tuple-shaped Result type with no external dependencies.
 *
 * Success looks like `[null, data]`; failure looks like `[error, null]`.
 * The error always carries a `reason` string discriminant so call sites can
 * narrow exhaustively in a switch.
 *
 * Use `const` generics on `ok`/`err` so literal strings are preserved
 * through the function call -- e.g. `err({ reason: 'unauthenticated' })`
 * keeps `'unauthenticated'` as a literal type, not widened to `string`.
 */

export type ResultError = { reason: string }

export type Result<S, E extends ResultError> =
  | [error: E, data: null]
  | [error: null, data: S]

export function ok<const S>(data: S): Result<S, never> {
  return [null, data]
}

export function err<const E extends ResultError>(error: E): Result<never, E> {
  return [error, null]
}

/**
 * Lift a throwing async function into a Result.
 *
 * The caller passes in a `mapError` so unexpected exceptions get the same
 * discriminated shape as the rest of the system, instead of leaking raw
 * `Error` instances across module boundaries.
 */
export async function tryCatch<S, E extends ResultError>(
  fn: () => Promise<S>,
  mapError: (cause: unknown) => E,
): Promise<Result<S, E>> {
  try {
    return ok(await fn())
  } catch (cause) {
    return err(mapError(cause))
  }
}

export function isOk<S, E extends ResultError>(
  r: Result<S, E>,
): r is [null, S] {
  return r[0] === null
}

export function isErr<S, E extends ResultError>(
  r: Result<S, E>,
): r is [E, null] {
  return r[0] !== null
}
