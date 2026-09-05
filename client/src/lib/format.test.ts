import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDuration } from './format'

describe('formatCurrency', () => {
  it('formatea números enteros con dos decimales', () => {
    expect(formatCurrency(145)).toContain('145')
    expect(formatCurrency(145)).toContain('.00')
    expect(formatCurrency(145)).toContain('S/')
  })

  it('formatea valores con decimales', () => {
    expect(formatCurrency(12.5)).toContain('12.50')
  })

  it('formatea cero', () => {
    expect(formatCurrency(0)).toContain('0')
  })

  it('no revienta con NaN o Infinity', () => {
    expect(formatCurrency(Number.NaN)).toContain('0')
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toContain('0')
  })
})

describe('formatDuration', () => {
  it('formatea segundos', () => {
    expect(formatDuration(5_000)).toBe('5s')
    expect(formatDuration(0)).toBe('0s')
  })

  it('formatea minutos y segundos', () => {
    expect(formatDuration(125_000)).toBe('2m 05s')
  })

  it('formatea horas y minutos', () => {
    expect(formatDuration(3_661_000)).toBe('1h 01m')
  })

  it('tolera NaN o negativos', () => {
    expect(formatDuration(Number.NaN)).toBe('0s')
    expect(formatDuration(-10)).toBe('0s')
  })
})
