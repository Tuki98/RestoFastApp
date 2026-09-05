import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('une clases simples', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('ignora valores falsy', () => {
    expect(cn('a', false, null, undefined, 0, '', 'b')).toBe('a b')
  })

  it('soporta objetos clsx', () => {
    expect(cn({ a: true, b: false }, 'c')).toBe('a c')
  })

  it('resuelve conflictos con tailwind-merge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})
