import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errors'

export function toastError(error: unknown): void {
  toast.error(getApiErrorMessage(error))
}
