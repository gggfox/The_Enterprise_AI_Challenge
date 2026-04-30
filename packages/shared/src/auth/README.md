# ABAC permissions

All authorization decisions in this codebase flow through `can(...)` (or
`canMaybe(...)` for show/hide UI checks). The `permissions.ts` table is
the single source of truth for who can do what to which resource.

## Convention

```ts
import { can } from '@enterprise-ai/shared/auth'

if (!can(user, 'update', 'prompt', prompt)) {
  return err({ reason: 'forbidden', action: 'update', resource: 'prompt' })
}
```

Direct role checks like `user.roles.includes('admin')` or
`user.role === 'admin'` are **not allowed** outside this folder. The
`scripts/no-role-checks.sh` lint enforces this; it runs in pre-commit
and can be invoked manually:

```bash
pnpm lint:no-role-checks
```

If you find yourself wanting a raw role check, the right move is almost
always to add a new entry to `PERMISSIONS` here and call `can(...)` at
the use site. That keeps the authorization matrix scannable and the
lint passing.

## Adding a resource

1. Extend `ResourceMap` in `permissions.ts` with the resource's
   data shape (only the fields predicates need to read).
2. Add an entry under each role in `PERMISSIONS` -- the `satisfies`
   clause will refuse to compile until every role row is filled in.
3. If a Convex table is involved, project its `Doc<T>` into the
   `ResourceMap[T]` shape inside the public mutation/query before
   calling `authorize(...)`.

## Why ABAC over flat RBAC

Roles alone can't express "users can update only their own non-archived
prompts". Predicate functions can. We keep roles for the coarse
"who is this person" grouping and use predicates for the
data-dependent decisions, all in one place.
