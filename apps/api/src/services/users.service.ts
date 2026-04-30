/**
 * User-management service. Only the role-assignment surface is exposed
 * via the Bridge -- everything else (sign-up, sign-in) is handled by
 * Convex Auth's HTTP routes directly.
 */

import { api } from '@enterprise-ai/convex/convex/_generated/api'
import {
  type AuthError,
  type NotFoundError,
  ROLES,
  type Result,
  type Role,
  type UpstreamError,
  type ValidationError,
  can,
  err,
  isRole,
  ok,
} from '@enterprise-ai/shared'
import { convexErrorToAppError } from '../plugins/error-mapper.js'
import { bootstrapConvex, userScopedConvex } from './convex.service.js'
import type { AuthCtx } from './prompts.service.js'

export type UserDTO = {
  _id: string
  email: string | null
  name: string | null
  roles: readonly Role[]
}

export async function listUsers(
  ctx: AuthCtx,
): Promise<Result<readonly UserDTO[], AuthError | UpstreamError>> {
  if (!can(ctx.user, 'view', 'user')) {
    return err({ reason: 'forbidden', action: 'view', resource: 'user' })
  }
  try {
    const raw = (await userScopedConvex(ctx.jwt).query(
      api.users.list,
      {},
    )) as readonly {
      _id: string
      email: string | null
      name: string | null
      roles: readonly string[]
    }[]
    return ok(
      raw.map((u) => ({
        ...u,
        roles: u.roles.filter(isRole),
      })),
    )
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : undefined
    return err({
      reason: 'upstream_failed' as const,
      service: 'convex',
      ...(msg ? { message: msg } : {}),
    })
  }
}

export async function setUserRoles(
  ctx: AuthCtx,
  input: { userId: string; roles: readonly string[] },
): Promise<
  Result<
    { _id: string; roles: readonly Role[] },
    AuthError | NotFoundError | ValidationError | UpstreamError
  >
> {
  if (!can(ctx.user, 'update', 'user', { _id: input.userId })) {
    return err({ reason: 'forbidden', action: 'update', resource: 'user' })
  }
  const invalid = input.roles.filter((r) => !isRole(r))
  if (invalid.length > 0) {
    return err({
      reason: 'validation_failed',
      issues: invalid.map((r) => `unknown role: ${r}`),
    })
  }
  try {
    const result = (await userScopedConvex(ctx.jwt).mutation(
      api.users.setRoles,
      { userId: input.userId as never, roles: input.roles as string[] },
    )) as { _id: string; roles: readonly string[] }
    return ok({
      _id: result._id,
      roles: result.roles.filter(isRole) as readonly Role[],
    })
  } catch (cause) {
    const app = convexErrorToAppError(cause)
    if (
      app.reason === 'forbidden' ||
      app.reason === 'unauthenticated' ||
      app.reason === 'not_found' ||
      app.reason === 'validation_failed' ||
      app.reason === 'upstream_failed'
    ) {
      return err(app)
    }
    return err({
      reason: 'upstream_failed' as const,
      service: 'convex',
      message: app.reason,
    })
  }
}

/**
 * Promote a user to admin via the deploy-key path. Used by `/api/v1/admin/seed`
 * to bootstrap the very first admin -- before there's any admin who can
 * call `setUserRoles` through the JWT path.
 */
export async function promoteAdminByEmail(
  email: string,
): Promise<
  Result<
    { _id: string; roles: readonly Role[]; changed: boolean },
    NotFoundError | AuthError | UpstreamError
  >
> {
  try {
    const result = (await bootstrapConvex().mutation(
      api.seed.promoteAdminByEmail,
      { email },
    )) as { _id: string; roles: readonly string[]; changed: boolean }
    return ok({
      _id: result._id,
      roles: result.roles.filter(isRole) as readonly Role[],
      changed: result.changed,
    })
  } catch (cause) {
    const app = convexErrorToAppError(cause)
    if (
      app.reason === 'not_found' ||
      app.reason === 'forbidden' ||
      app.reason === 'unauthenticated'
    ) {
      return err(app)
    }
    return err({
      reason: 'upstream_failed',
      service: 'convex',
      ...(app.reason ? { message: app.reason } : {}),
    })
  }
}

export { ROLES }
