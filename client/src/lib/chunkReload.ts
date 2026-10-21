const RELOAD_KEY = 'restobar:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 10_000

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \d+ failed/i,
  /loading css chunk/i,
  /unable to preload/i,
]

/**
 * Detecta errores típicos de carga de chunks dinámicos. Ocurren cuando el
 * navegador tiene cacheado un index.html viejo que apunta a assets que ya no
 * existen (p. ej. tras un redeploy). En ese caso, recargar la página resuelve
 * el problema porque trae el index.html nuevo.
 */
export function isChunkLoadError(error: unknown): boolean {
  let message = ''
  if (typeof error === 'string') {
    message = error
  } else if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message: unknown }).message)
  }
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Fuerza una recarga completa. Usa un guard en sessionStorage para evitar
 * bucles de recarga infinitos: solo recarga si no se intentó en los últimos
 * segundos. Devuelve true si la recarga se disparó.
 */
export function reloadForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_COOLDOWN_MS) {
      return false
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage puede no estar disponible (modo privado); seguimos igual.
  }
  window.location.reload()
  return true
}

/** Instala listeners globales que recargan la app ante fallos de chunk. */
export function installChunkErrorHandler(): void {
  // Vite emite este evento cuando falla un import() dinámico.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadForChunkError()
  })

  // Respaldo para errores de import que no pasan por el evento de Vite.
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadForChunkError()
    }
  })
}
