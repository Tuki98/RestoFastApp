const currency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return currency.format(0)
  }
  return currency.format(value)
}

const date = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTime = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | Date): string {
  return date.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value))
}

export function formatNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  return `${seconds}s`
}
