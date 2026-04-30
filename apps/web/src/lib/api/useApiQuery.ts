/**
 * `useApiQuery` -- TanStack Query wrapper that surfaces a typed AppError.
 *
 * The query function returns a `Result` tuple; on `err` we throw a
 * marker error carrying the AppError so TanStack Query's retry/cache
 * machinery still works. The hook unwraps it back into a typed
 * `error: AppError | null` for the consumer.
 */

import type { AppError, Result } from '@enterprise-ai/shared'
import {
  type QueryKey,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'

class AppErrorThrowable extends Error {
  readonly appError: AppError
  constructor(appError: AppError) {
    super(appError.reason)
    this.name = 'AppErrorThrowable'
    this.appError = appError
  }
}

type Options<T> = Omit<
  UseQueryOptions<T, Error, T, QueryKey>,
  'queryKey' | 'queryFn'
>

export function useApiQuery<T>(
  key: QueryKey,
  fn: (signal: AbortSignal) => Promise<Result<T, AppError>>,
  options: Options<T> = {},
) {
  const q = useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const [errorVal, data] = await fn(signal)
      if (errorVal !== null) throw new AppErrorThrowable(errorVal)
      return data as T
    },
    ...options,
  })

  const error = q.error instanceof AppErrorThrowable ? q.error.appError : null
  return { ...q, error }
}

export { AppErrorThrowable }
