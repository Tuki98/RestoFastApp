import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from './chunkReload'

describe('isChunkLoadError', () => {
  it('detecta el error de import dinámico de Vite/chrome', () => {
    expect(
      isChunkLoadError(
        new Error(
          'Failed to fetch dynamically imported module: https://x/assets/ReportsPage-abc.js',
        ),
      ),
    ).toBe(true)
  })

  it('detecta "Importing a module script failed"', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(
      true,
    )
  })

  it('detecta "Loading chunk N failed"', () => {
    expect(isChunkLoadError('Loading chunk 42 failed.')).toBe(true)
  })

  it('detecta "unable to preload"', () => {
    expect(isChunkLoadError('Unable to preload CSS for /assets/x.css')).toBe(
      true,
    )
  })

  it('ignora errores que no son de carga de chunk', () => {
    expect(isChunkLoadError(new Error('Algo salió mal'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({ message: 'Network request failed' })).toBe(false)
  })
})
