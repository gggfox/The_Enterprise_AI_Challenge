import { describe, expect, it } from 'vitest'
import { joinClassNames } from './joinClassNames'

describe('joinClassNames', () => {
  it('joins two strings with a single space', () => {
    expect(joinClassNames('a', 'b')).toBe('a b')
  })

  it('drops falsy values: false, null, undefined, empty string', () => {
    expect(joinClassNames('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('supports the cond && className pattern', () => {
    const isActive = true
    const isDisabled = false
    expect(
      joinClassNames('base', isActive && 'active', isDisabled && 'disabled'),
    ).toBe('base active')
  })

  it('flattens one level of nested arrays', () => {
    expect(joinClassNames(['a', 'b'], 'c')).toBe('a b c')
  })

  it('flattens deeply nested arrays', () => {
    expect(joinClassNames([['a', ['b', ['c']]], 'd'])).toBe('a b c d')
  })

  it('object form: includes true keys, drops false/null/undefined', () => {
    expect(
      joinClassNames({
        a: true,
        b: false,
        c: null,
        d: undefined,
        e: true,
      }),
    ).toBe('a e')
  })

  it('mixes strings, arrays, and objects in one call', () => {
    expect(
      joinClassNames(
        'base',
        ['extra', { active: true, hidden: false }],
        'tail',
      ),
    ).toBe('base extra active tail')
  })

  it('returns empty string when called with no arguments', () => {
    expect(joinClassNames()).toBe('')
  })

  it('returns empty string when all arguments are falsy', () => {
    expect(joinClassNames(false, null, undefined, '', [false, null], {})).toBe(
      '',
    )
  })

  it('last-wins: a later object setting a key to false removes it', () => {
    expect(joinClassNames({ a: true }, { a: false })).toBe('')
  })

  it('preserves first-occurrence order across arguments', () => {
    expect(joinClassNames('z', 'a', 'm')).toBe('z a m')
  })

  it('deduplicates repeated class names', () => {
    expect(joinClassNames('a', 'a', 'b')).toBe('a b')
  })
})
