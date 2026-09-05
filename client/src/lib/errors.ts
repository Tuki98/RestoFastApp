import axios from 'axios'

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[] }
      | undefined
    if (Array.isArray(data?.message)) {
      return data.message.join(', ')
    }
    if (data?.message) {
      return data.message
    }
  }
  return 'Ocurrió un error inesperado'
}
