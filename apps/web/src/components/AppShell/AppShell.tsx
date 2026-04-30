/**
 * Top-level layout that handles the auth gate and renders the nav.
 *
 * Clerk's `useAuth` exposes `isLoaded` / `isSignedIn`. While Clerk is
 * still booting we render a placeholder; when not signed in we render
 * the SignIn card; when signed in we trigger `users.ensureProvisioned`
 * once to JIT-create the Convex `users` row, then render children.
 *
 * The Convex `useQuery(api.users.me)` returns null until provisioning
 * has run -- we treat that as "still loading" rather than "no user".
 */

import { SignIn } from '@/components/SignIn/SignIn'
import { UserButton, useAuth } from '@clerk/clerk-react'
import { api } from '@enterprise-ai/convex/convex/_generated/api'
import { type Role, canMaybe, isRole } from '@enterprise-ai/shared/auth'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { type ReactNode, useEffect, useRef } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const me = useQuery(api.users.me)
  const ensureProvisioned = useMutation(api.users.ensureProvisioned)
  const provisionedRef = useRef(false)

  useEffect(() => {
    if (!isSignedIn) {
      provisionedRef.current = false
      return
    }
    // Idempotent on the server, but we still gate at the client to avoid
    // a redundant round trip on every render.
    if (provisionedRef.current) return
    provisionedRef.current = true
    void ensureProvisioned({}).catch(() => {
      // Allow a retry on the next render if provisioning failed.
      provisionedRef.current = false
    })
  }, [isSignedIn, ensureProvisioned])

  if (!isLoaded) {
    return (
      <main className="page">
        <p>Loading...</p>
      </main>
    )
  }

  if (!isSignedIn) {
    return (
      <main className="page">
        <SignIn />
      </main>
    )
  }

  // Signed in but Convex hasn't returned the row yet -- ensureProvisioned
  // is in flight. Render a placeholder rather than the children, which
  // would otherwise issue authenticated queries against a row that
  // doesn't exist yet.
  if (me === undefined || me === null) {
    return (
      <main className="page">
        <p>Setting up your account...</p>
      </main>
    )
  }

  const roles = (me.roles ?? []).filter(isRole) as readonly Role[]
  const canViewUsers = canMaybe({ _id: me._id ?? '', roles }, 'view', 'user')

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Enterprise AI
        </Link>
        <nav className="nav">
          <Link to="/prompts">Prompts</Link>
          {canViewUsers && <Link to="/admin">Admin</Link>}
        </nav>
        <div className="who">
          <span className="muted">
            {me.email ?? 'no email'} · {roles.join(', ') || 'no roles'}
          </span>
          <UserButton />
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
