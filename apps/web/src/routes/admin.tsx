import { AppShell } from '@/components/AppShell/AppShell'
import { useApiMutation } from '@/lib/api/useApiMutation'
import { useAuthedFetch } from '@/lib/auth'
import { api } from '@enterprise-ai/convex/convex/_generated/api'
import { ALL_ROLES, type Role, isRole } from '@enterprise-ai/shared/auth'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery as useConvexQuery } from 'convex/react'

export const Route = createFileRoute('/admin')({ component: AdminPage })

type UserDTO = {
  _id: string
  email: string | null
  name: string | null
  roles: readonly string[]
}

function AdminPage() {
  // Reactive read of users so role changes by other admins show up live.
  const users = useConvexQuery(api.users.list) as readonly UserDTO[] | undefined
  const queryClient = useQueryClient()
  const fetchWithAuth = useAuthedFetch()

  const setRoles = useApiMutation<
    { userId: string; roles: readonly Role[] },
    { _id: string; roles: readonly Role[] }
  >(
    (vars) =>
      fetchWithAuth('/api/v1/users/roles', {
        method: 'POST',
        body: vars,
      }),
    {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['users'] })
      },
    },
  )

  return (
    <AppShell>
      <section className="stack">
        <h1>Admin · Roles</h1>
        <p className="muted">
          Toggle role assignments. Only an admin can mutate any user; a
          non-admin can only update their own row (per the ABAC predicate).
        </p>

        {setRoles.error && (
          <p className="error">
            {setRoles.error.reason}
            {setRoles.error.reason === 'forbidden' &&
              ` (${setRoles.error.action} on ${setRoles.error.resource})`}
          </p>
        )}

        {users === undefined ? (
          <p>Loading users...</p>
        ) : (
          <table className="users">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                {ALL_ROLES.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roles = u.roles.filter(isRole) as readonly Role[]
                return (
                  <tr key={u._id}>
                    <td>{u.email ?? <em>(no email)</em>}</td>
                    <td>{u.name ?? <em>(no name)</em>}</td>
                    {ALL_ROLES.map((r) => {
                      const has = roles.includes(r)
                      return (
                        <td key={r}>
                          <input
                            type="checkbox"
                            checked={has}
                            onChange={() => {
                              const next = has
                                ? roles.filter((x) => x !== r)
                                : [...roles, r]
                              setRoles.mutate({
                                userId: u._id,
                                roles: next,
                              })
                            }}
                            disabled={setRoles.isPending}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  )
}
