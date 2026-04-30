/**
 * Convex client singleton for the browser.
 *
 * `ConvexReactClient` opens the websocket; `ConvexProviderWithClerk`
 * (from `convex/react-clerk`) is layered on top in `__root.tsx` so
 * `useQuery` subscriptions automatically carry the Clerk-issued JWT
 * (template: "convex").
 */

import { ConvexReactClient } from 'convex/react'

const url = (import.meta.env?.VITE_CONVEX_URL as string | undefined) ?? ''

if (!url && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    '[convex] VITE_CONVEX_URL not set -- the websocket client will fail to connect',
  )
}

export const convex = new ConvexReactClient(
  url || 'https://placeholder.convex.cloud',
)
