import { convex } from '@/lib/convex'
import { getQueryClient } from '@/lib/queryClient'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { ReactNode } from 'react'
import appCss from '../styles/tokens.css?url'

const PUBLISHABLE_KEY =
  (import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? ''

if (!PUBLISHABLE_KEY && typeof window !== 'undefined') {
  console.warn(
    '[clerk] VITE_CLERK_PUBLISHABLE_KEY is not set -- sign-in will fail to load',
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      { title: 'Enterprise AI' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  const queryClient = getQueryClient()
  return (
    <RootDocument>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <QueryClientProvider client={queryClient}>
            <Outlet />
          </QueryClientProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
