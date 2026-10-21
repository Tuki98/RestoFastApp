import { lazy, type ComponentType } from 'react'
import { isChunkLoadError, reloadForChunkError } from './chunkReload'

/**
 * Igual que React.lazy, pero si la carga del chunk falla (p. ej. porque el
 * navegador tiene cacheado un build viejo) recarga la página para traer los
 * assets actualizados. Si no se puede recargar (guard anti-bucle), deja que el
 * error suba al ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      if (isChunkLoadError(error) && reloadForChunkError()) {
        // La recarga está en curso: mantenemos el Suspense pendiente.
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}
