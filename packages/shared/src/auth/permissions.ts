/**
 * Centralized ABAC permission table.
 *
 * Every authorization decision in the codebase flows through `can(...)`.
 * Role checks like `user.roles.includes('admin')` are forbidden outside
 * this folder -- if you find yourself wanting one, the right answer is
 * usually a new permission predicate here.
 *
 * Resources are declared once in `ResourceMap` so predicates get a typed
 * second argument. Adding a new resource means: extend `ResourceMap`,
 * extend `PERMISSIONS`, done. TypeScript will refuse to compile until
 * every role row is covered (`satisfies` clause below).
 */

import { type Action, ROLES, type Role } from './roles'

/**
 * Subject of an authorization check. Both Bridge handlers and Convex
 * mutations construct this from their respective identity sources.
 */
export type AuthUser = {
  _id: string
  roles: readonly Role[]
}

type Predicate<T> = (user: AuthUser, resource: T) => boolean
type Permission<T> = boolean | Predicate<T>

/**
 * Resource registry. Each entry's value type is the data shape predicates
 * receive when evaluating ownership/state-based rules. Keep these to the
 * minimum fields the predicates actually read so this module never
 * imports DB-specific types (Convex `Doc<...>` etc.).
 */
export type ResourceMap = {
  prompt: {
    _id: string
    authorId: string
    archived: boolean
  }
  user: {
    _id: string
  }
}

export type ResourceKey = keyof ResourceMap

type RolePermissions = {
  [R in ResourceKey]?: {
    [A in Action]?: Permission<ResourceMap[R]>
  }
}

export const PERMISSIONS = {
  admin: {
    prompt: { view: true, create: true, update: true, delete: true },
    user: { view: true, create: true, update: true, delete: true },
  },
  moderator: {
    prompt: { view: true, update: true },
    user: { view: true },
  },
  user: {
    prompt: {
      view: true,
      create: true,
      update: (u, p) => p.authorId === u._id && !p.archived,
      delete: (u, p) => p.authorId === u._id,
    },
    user: {
      view: true,
      update: (u, target) => u._id === target._id,
    },
  },
} as const satisfies Record<Role, RolePermissions>

/**
 * Authorization check.
 *
 * Returns true when ANY of the user's roles grants the action. Predicate
 * rules require the resource data argument; literal `true`/`false` rules
 * do not. A missing entry defaults to deny.
 */
export function can<R extends ResourceKey, A extends Action>(
  user: AuthUser,
  action: A,
  resource: R,
  data?: ResourceMap[R],
): boolean {
  for (const role of user.roles) {
    const resourceRules = (PERMISSIONS[role] as RolePermissions)[resource]
    const rule = resourceRules?.[action] as
      | Permission<ResourceMap[R]>
      | undefined
    if (rule === true) return true
    if (typeof rule === 'function' && data && rule(user, data)) return true
  }
  return false
}

/**
 * Coarse, data-free check used for FE show/hide decisions where we don't
 * have the resource yet (e.g. "should we render the Create button?").
 * Predicate rules count as "maybe" -- treat as allowed at the UI layer
 * and rely on the server-side check with full data to enforce.
 */
export function canMaybe<R extends ResourceKey, A extends Action>(
  user: AuthUser,
  action: A,
  resource: R,
): boolean {
  for (const role of user.roles) {
    const resourceRules = (PERMISSIONS[role] as RolePermissions)[resource]
    const rule = resourceRules?.[action]
    if (rule === true) return true
    if (typeof rule === 'function') return true
  }
  return false
}

export { ROLES }
export type { Action, Role }
