/**
 * `useApiMutation` -- mirror of `useApiQuery` for writes.
 */

import type { AppError, Result } from '@enterprise-ai/shared'
import { type UseMutationOptions, useMutation } from '@tanstack/react-query'
import { AppErrorThrowable } from './useApiQuery'

type Options<TVariables, TData> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>

export function useApiMutation<TVariables, TData>(
  fn: (vars: TVariables) => Promise<Result<TData, AppError>>,
  options: Options<TVariables, TData> = {},
) {
  const m = useMutation<TData, Error, TVariables>({
    mutationFn: async (vars) => {
      const [errorVal, data] = await fn(vars)
      if (errorVal !== null) throw new AppErrorThrowable(errorVal)
      return data as TData
    },
    ...options,
  })
  const error = m.error instanceof AppErrorThrowable ? m.error.appError : null
  return { ...m, error }
}
