/**
 * Roles and resource/action enums for the ABAC system.
 *
 * `as const` on every literal map keeps the values as literal types so the
 * permissions table below is fully type-narrowed. Add a role here and
 * TypeScript forces you to fill in the corresponding row in
 * `permissions.ts`.
 */

export const ROLES = {
  admin: 'admin',
  moderator: 'moderator',
  user: 'user',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES = Object.values(ROLES) as readonly Role[]

export const DEFAULT_ROLES: readonly Role[] = [ROLES.user] as const

export const ACTIONS = ['view', 'create', 'update', 'delete'] as const
export type Action = (typeof ACTIONS)[number]

export function isRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value)
}
