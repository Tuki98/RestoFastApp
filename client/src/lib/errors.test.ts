import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './errors'

interface FakeAxiosError {
  isAxiosError: boolean
  response?: { data?: unknown }
}

describe('getApiErrorMessage', () => {
  it('devuelve el mensaje de una respuesta de error', () => {
    const error: FakeAxiosError = {
      isAxiosError: true,
      response: { data: { message: 'Correo o contraseña incorrectos' } },
    }
    expect(getApiErrorMessage(error)).toBe('Correo o contraseña incorrectos')
  })

  it('une los mensajes de validación en array', () => {
    const error: FakeAxiosError = {
      isAxiosError: true,
      response: { data: { message: ['name must not be empty', 'email inválido'] } },
    }
    expect(getApiErrorMessage(error)).toBe(
      'name must not be empty, email inválido',
    )
  })

  it('devuelve mensaje genérico si la respuesta no trae datos', () => {
    const error: FakeAxiosError = { isAxiosError: true, response: {} }
    expect(getApiErrorMessage(error)).toBe('Ocurrió un error inesperado')
  })

  it('devuelve mensaje genérico para errores que no son de axios', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe(
      'Ocurrió un error inesperado',
    )
    expect(getApiErrorMessage('texto')).toBe('Ocurrió un error inesperado')
    expect(getApiErrorMessage(undefined)).toBe('Ocurrió un error inesperado')
  })
})
