import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { isChunkLoadError, reloadForChunkError } from '@/lib/chunkReload'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
  isChunkError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
    isChunkError: false,
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Error inesperado',
      isChunkError: isChunkLoadError(error),
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Error de aplicación:', error, info)

    // Si falla la carga de un chunk (build viejo cacheado), recargamos para
    // traer los assets nuevos en vez de dejar una pantalla de error.
    if (isChunkLoadError(error) && reloadForChunkError()) {
      return
    }
  }

  handleReload = () => {
    window.location.href = '/'
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.message) && reloadForChunkError()) {
      return
    }
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {this.state.isChunkError
              ? 'Hay una versión nueva disponible'
              : 'Algo salió mal'}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.isChunkError
              ? 'Actualiza la página para cargar la última versión de la aplicación.'
              : this.state.message}
          </p>
          <div className="flex gap-2">
            <Button onClick={this.handleRetry}>Actualizar</Button>
            {!this.state.isChunkError && (
              <Button variant="outline" onClick={this.handleReload}>
                Volver al inicio
              </Button>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
