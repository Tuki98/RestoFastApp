import { describe, expect, it } from 'vitest'
import { computeTotals, mergeLines, TAX_RATE } from './cart'
import type { CartLine } from './cart'

describe('computeTotals', () => {
  it('sin applyIgv no aplica impuesto', () => {
    const totals = computeTotals([
      { unitPrice: 135, quantity: 2 },
      { unitPrice: 55, quantity: 1 },
    ])

    expect(totals.subtotal).toBe(325)
    expect(totals.tax).toBe(0)
    expect(totals.total).toBe(325)
    expect(totals.itemCount).toBe(3)
  })

  it('aplica IGV cuando applyIgv es true', () => {
    const totals = computeTotals(
      [
        { unitPrice: 135, quantity: 2 },
        { unitPrice: 55, quantity: 1 },
      ],
      true,
    )

    expect(totals.subtotal).toBe(325)
    expect(totals.tax).toBe(52)
    expect(totals.total).toBe(377)
  })

  it('es centavo-exacto con precios decimales al aplicar IGV', () => {
    const totals = computeTotals(
      [
        { unitPrice: 0.1, quantity: 3 },
        { unitPrice: 19.99, quantity: 2 },
      ],
      true,
    )

    expect(totals.subtotal).toBe(40.28)
    expect(totals.tax).toBe(6.44)
    expect(totals.total).toBe(46.72)
  })

  it('usa la tasa de IGV definida', () => {
    expect(TAX_RATE).toBe(0.16)
  })

  it('devuelve ceros para un carrito vacío', () => {
    expect(computeTotals([])).toEqual({
      subtotal: 0,
      tax: 0,
      total: 0,
      itemCount: 0,
    })
  })
})

describe('mergeLines', () => {
  const line: CartLine = { productId: 'p1', productName: 'Cerveza', unitPrice: 55, quantity: 1 }

  it('agrega una línea nueva con cantidad 1 por defecto', () => {
    const result = mergeLines([], { productId: 'p1', productName: 'Cerveza', unitPrice: 55 })
    expect(result).toEqual([{ ...line, quantity: 1 }])
  })

  it('incrementa la cantidad si el producto ya está', () => {
    const result = mergeLines([{ ...line, quantity: 2 }], { productId: 'p1', productName: 'Cerveza', unitPrice: 55 })
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
  })
})
