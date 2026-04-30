import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, ok, tryCatch } from './result'

describe('Result', () => {
  it('ok returns [null, data] and isOk narrows', () => {
    const r = ok({ id: 1 })
    expect(r).toEqual([null, { id: 1 }])
    if (isOk(r)) {
      expect(r[1].id).toBe(1)
    }
  })

  it('err returns [error, null] and isErr narrows', () => {
    const r = err({ reason: 'not_found', resource: 'prompt' } as const)
    expect(r[0]?.reason).toBe('not_found')
    expect(r[1]).toBeNull()
    if (isErr(r)) {
      expect(r[0].reason).toBe('not_found')
    }
  })

  it('preserves literal reason via const generic', () => {
    const r = err({ reason: 'forbidden', action: 'update', resource: 'x' })
    // Compile-time: r[0].reason is 'forbidden', not string. Runtime value
    // confirms.
    expect(r[0]?.reason).toBe('forbidden')
  })

  it('tryCatch wraps a throw with mapError', async () => {
    const r = await tryCatch(
      async () => {
        throw new Error('boom')
      },
      () => ({ reason: 'internal', message: 'boom' }) as const,
    )
    expect(r[0]?.reason).toBe('internal')
  })

  it('tryCatch returns ok on success', async () => {
    const r = await tryCatch(
      async () => 42,
      () => ({ reason: 'internal' }) as const,
    )
    expect(r).toEqual([null, 42])
  })
})
