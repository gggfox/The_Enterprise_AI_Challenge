/**
 * Bridge auth helper.
 *
 * Clerk owns the session and mints a JWT via the "convex" template
 * (audience = "convex"). We do NOT read it from localStorage -- Clerk's
 * SDK keeps the session in a HttpOnly cookie + memory and hands us a
 * fresh, short-lived token via `getToken()` on demand.
 *
 * Components call `useAuthedFetch()` to get a bound `fetchWithAuth(path,
 * init)` that automatically attaches `Authorization: Bearer <jwt>` to
 * every request. Removing the JWT plumbing from call sites means it's
 * no longer possible to forget to authenticate a Bridge call.
 */

import { useAuth } from '@clerk/clerk-react'
import { type AppError, type Result, err, ok } from '@enterprise-ai/shared'
import { useCallback } from 'react'

const API_BASE =
  (import.meta.env?.VITE_API_BASE as string | undefined) ??
  'http://localhost:3111'

const JWT_TEMPLATE = 'convex'

export type FetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export type AuthedFetch = <T>(
  path: string,
  opts?: FetchOptions,
) => Promise<Result<T, AppError>>

async function executeRequest<T>(
  token: string | null,
  path: string,
  opts: FetchOptions,
): Promise<Result<T, AppError>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
    }
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body)
    }
    if (opts.signal) {
      init.signal = opts.signal
    }
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (cause) {
    return err({
      reason: 'upstream_failed',
      service: 'bridge',
      ...(cause instanceof Error ? { message: cause.message } : {}),
    })
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    return err({
      reason: 'upstream_failed',
      service: 'bridge',
      status: res.status,
    })
  }

  if (res.ok) {
    const data = (payload as { data?: T }).data
    return ok(data as T)
  }

  const error = (payload as { error?: AppError }).error
  if (error && typeof error === 'object' && 'reason' in error) {
    return err(error)
  }
  return err({
    reason: 'upstream_failed',
    service: 'bridge',
    status: res.status,
  })
}

/**
 * Hook that returns a `fetchWithAuth` bound to the current Clerk session.
 * The returned function has the same surface as the old `apiFetch` but
 * mints the JWT itself instead of accepting it as a parameter.
 */
export function useAuthedFetch(): AuthedFetch {
  const { getToken } = useAuth()
  return useCallback<AuthedFetch>(
    async (path, opts = {}) => {
      let token: string | null
      try {
        token = await getToken({ template: JWT_TEMPLATE })
      } catch (cause) {
        return err({
          reason: 'unauthenticated',
          ...(cause instanceof Error ? { message: cause.message } : {}),
        })
      }
      return executeRequest(token, path, opts)
    },
    [getToken],
  )
}
