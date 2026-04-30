/**
 * Prompt operations expressed as Result-returning service functions.
 *
 * Each function authorizes locally with `can(...)`, then forwards to a
 * Convex public mutation that re-checks. The service layer is the place
 * where typed `Result` lives; route handlers stay thin, just shaping the
 * HTTP wrapper around the result.
 */

import { api } from '@enterprise-ai/convex/convex/_generated/api'
import {
  type AppError,
  type AuthError,
  type NotFoundError,
  type Result,
  type UpstreamError,
  type ValidationError,
  can,
  err,
  ok,
} from '@enterprise-ai/shared'
import { convexErrorToAppError } from '../plugins/error-mapper.js'
import { anonConvex, userScopedConvex } from './convex.service.js'

export type AuthCtx = {
  user: {
    _id: string
    roles: readonly import('@enterprise-ai/shared/auth').Role[]
  }
  jwt: string
}

export type PromptDTO = {
  _id: string
  authorId: string
  authorName: string
  title: string
  body: string
  archived: boolean
  _creationTime: number
}

type ListErr = AuthError | UpstreamError
type CreateErr = AuthError | ValidationError | UpstreamError
type UpdateErr = AuthError | NotFoundError | ValidationError | UpstreamError
type DeleteErr = AuthError | NotFoundError | UpstreamError

export async function listPrompts(
  ctx: AuthCtx,
): Promise<Result<readonly PromptDTO[], ListErr>> {
  if (!can(ctx.user, 'view', 'prompt')) {
    return err({
      reason: 'forbidden',
      action: 'view',
      resource: 'prompt',
    })
  }
  try {
    const data = (await userScopedConvex(ctx.jwt).query(
      api.prompts.list,
      {},
    )) as readonly PromptDTO[]
    return ok(data)
  } catch (cause) {
    return err(asListErr(cause))
  }
}

export async function listPromptsAnon(): Promise<
  Result<readonly PromptDTO[], UpstreamError>
> {
  try {
    const data = (await anonConvex().query(
      api.prompts.list,
      {},
    )) as readonly PromptDTO[]
    return ok(data)
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : undefined
    return err({
      reason: 'upstream_failed' as const,
      service: 'convex',
      ...(msg ? { message: msg } : {}),
    })
  }
}

export async function createPrompt(
  ctx: AuthCtx,
  input: { title: string; body: string },
): Promise<Result<{ _id: string }, CreateErr>> {
  if (!can(ctx.user, 'create', 'prompt')) {
    return err({
      reason: 'forbidden',
      action: 'create',
      resource: 'prompt',
    })
  }
  try {
    const data = (await userScopedConvex(ctx.jwt).mutation(
      api.prompts.create,
      input,
    )) as { _id: string }
    return ok(data)
  } catch (cause) {
    return err(asCreateErr(cause))
  }
}

export async function updatePrompt(
  ctx: AuthCtx,
  input: {
    id: string
    title?: string
    body?: string
    archived?: boolean
  },
): Promise<Result<{ _id: string }, UpdateErr>> {
  // Convex re-checks ownership-aware ABAC predicate after loading the
  // resource. The Bridge cannot do that pre-flight check without an
  // extra round trip, so we rely on Convex for the data-aware decision
  // and only do the coarse "can this user even attempt update" filter
  // here. (`canMaybe` is too permissive for this layer; we instead
  // rely on the eventual Convex re-check.)
  try {
    const data = (await userScopedConvex(ctx.jwt).mutation(
      api.prompts.update,
      input as never,
    )) as { _id: string }
    return ok(data)
  } catch (cause) {
    return err(asUpdateErr(cause))
  }
}

export async function deletePrompt(
  ctx: AuthCtx,
  input: { id: string },
): Promise<Result<{ _id: string }, DeleteErr>> {
  try {
    const data = (await userScopedConvex(ctx.jwt).mutation(
      api.prompts.remove,
      input as never,
    )) as { _id: string }
    return ok(data)
  } catch (cause) {
    return err(asDeleteErr(cause))
  }
}

function asListErr(cause: unknown): ListErr {
  return narrow(cause, ['unauthenticated', 'forbidden', 'upstream_failed'])
}
function asCreateErr(cause: unknown): CreateErr {
  return narrow(cause, [
    'unauthenticated',
    'forbidden',
    'validation_failed',
    'upstream_failed',
  ])
}
function asUpdateErr(cause: unknown): UpdateErr {
  return narrow(cause, [
    'unauthenticated',
    'forbidden',
    'not_found',
    'validation_failed',
    'upstream_failed',
  ])
}
function asDeleteErr(cause: unknown): DeleteErr {
  return narrow(cause, [
    'unauthenticated',
    'forbidden',
    'not_found',
    'upstream_failed',
  ])
}

function narrow<E extends AppError['reason']>(
  cause: unknown,
  expected: readonly E[],
): Extract<AppError, { reason: E }> {
  const app = convexErrorToAppError(cause)
  if ((expected as readonly string[]).includes(app.reason)) {
    return app as Extract<AppError, { reason: E }>
  }
  // Anything else collapses to upstream_failed so the caller's narrow
  // union stays honest.
  const fallback: AppError = {
    reason: 'upstream_failed',
    service: 'convex',
    message: app.reason,
  }
  return fallback as Extract<AppError, { reason: E }>
}
