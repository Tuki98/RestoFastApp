import type { CartLine } from '@/lib/cart'

export type PosDraftTarget =
  | { kind: 'TABLE'; tableId: string }
  | { kind: 'TAKEOUT' }

export interface PosDraft {
  target: PosDraftTarget | null
  lines: CartLine[]
  orderNotes: string
}

const STORAGE_KEY = 'restobar-pos-draft'

export function loadPosDraft(): PosDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PosDraft
    if (!parsed || !Array.isArray(parsed.lines)) return null
    return parsed
  } catch {
    return null
  }
}

export function savePosDraft(draft: PosDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // almacenamiento no disponible
  }
}

export function clearPosDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // almacenamiento no disponible
  }
}
