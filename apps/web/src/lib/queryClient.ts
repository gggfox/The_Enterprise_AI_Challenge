import { QueryClient } from '@tanstack/react-query'

let _queryClient: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (_queryClient) return _queryClient
  _queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Don't retry on auth or validation errors -- those are the
          // user's problem to fix, not a transient network blip.
          const reason =
            (error as { appError?: { reason?: string } })?.appError?.reason ??
            null
          if (
            reason === 'unauthenticated' ||
            reason === 'forbidden' ||
            reason === 'validation_failed' ||
            reason === 'not_found'
          ) {
            return false
          }
          return failureCount < 2
        },
      },
    },
  })
  return _queryClient
}
