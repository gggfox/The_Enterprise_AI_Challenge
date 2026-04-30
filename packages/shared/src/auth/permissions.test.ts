import { describe, expect, it } from 'vitest'
import { type AuthUser, can, canMaybe } from './permissions'
import { ROLES } from './roles'

const admin: AuthUser = { _id: 'u_admin', roles: [ROLES.admin] }
const moderator: AuthUser = { _id: 'u_mod', roles: [ROLES.moderator] }
const alice: AuthUser = { _id: 'u_alice', roles: [ROLES.user] }
const bob: AuthUser = { _id: 'u_bob', roles: [ROLES.user] }

const alicePrompt = {
  _id: 'p1',
  authorId: 'u_alice',
  archived: false,
} as const
const aliceArchived = {
  _id: 'p2',
  authorId: 'u_alice',
  archived: true,
} as const
const bobPrompt = { _id: 'p3', authorId: 'u_bob', archived: false } as const

describe('can / ABAC', () => {
  it('admin can do everything', () => {
    expect(can(admin, 'view', 'prompt', alicePrompt)).toBe(true)
    expect(can(admin, 'create', 'prompt')).toBe(true)
    expect(can(admin, 'delete', 'prompt', bobPrompt)).toBe(true)
  })

  it('moderator can update any prompt but cannot delete', () => {
    expect(can(moderator, 'update', 'prompt', bobPrompt)).toBe(true)
    expect(can(moderator, 'delete', 'prompt', bobPrompt)).toBe(false)
  })

  it('user can update own non-archived prompt', () => {
    expect(can(alice, 'update', 'prompt', alicePrompt)).toBe(true)
  })

  it('user cannot update own archived prompt', () => {
    expect(can(alice, 'update', 'prompt', aliceArchived)).toBe(false)
  })

  it("user cannot update another user's prompt", () => {
    expect(can(alice, 'update', 'prompt', bobPrompt)).toBe(false)
  })

  it('user can delete own prompt regardless of archived', () => {
    expect(can(alice, 'delete', 'prompt', alicePrompt)).toBe(true)
    expect(can(alice, 'delete', 'prompt', aliceArchived)).toBe(true)
  })

  it('multi-role union allows if any role grants', () => {
    const dual: AuthUser = { _id: 'u_x', roles: [ROLES.user, ROLES.moderator] }
    expect(can(dual, 'update', 'prompt', bobPrompt)).toBe(true)
  })

  it('missing entry denies by default', () => {
    expect(can(alice, 'delete', 'user', { _id: 'u_alice' })).toBe(false)
  })

  it('canMaybe treats predicate rules as "maybe yes" for UI', () => {
    expect(canMaybe(alice, 'update', 'prompt')).toBe(true)
    expect(canMaybe(alice, 'delete', 'user')).toBe(false)
  })
})
