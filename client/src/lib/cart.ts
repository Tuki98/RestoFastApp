export const TAX_RATE = 0.16

export interface CartLine {
  id?: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  notes?: string
}

export interface CartTotals {
  subtotal: number
  tax: number
  total: number
  itemCount: number
}

export function computeTotals(
  lines: Pick<CartLine, 'unitPrice' | 'quantity'>[],
  applyIgv = false,
): CartTotals {
  const subtotalCents = lines.reduce(
    (acc, line) => acc + Math.round(line.unitPrice * 100) * line.quantity,
    0,
  )
  const taxCents = applyIgv ? Math.round(subtotalCents * TAX_RATE) : 0
  const subtotal = subtotalCents / 100
  const tax = taxCents / 100
  const total = (subtotalCents + taxCents) / 100
  const itemCount = lines.reduce((acc, line) => acc + line.quantity, 0)
  return { subtotal, tax, total, itemCount }
}

export function mergeLines(
  lines: CartLine[],
  line: Omit<CartLine, 'quantity'> & { quantity?: number },
): CartLine[] {
  const existing = lines.find((l) => l.productId === line.productId)
  if (!existing) {
    return [...lines, { ...line, quantity: line.quantity ?? 1 }]
  }
  return lines.map((l) =>
    l.productId === line.productId
      ? { ...l, quantity: l.quantity + (line.quantity ?? 1) }
      : l,
  )
}
