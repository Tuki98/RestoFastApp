import { Loader2 } from 'lucide-react'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmDeleteTarget {
  kind: string
  id: string
  name: string
}

function ConfirmDeleteDialog({
  target,
  isSubmitting,
  error,
  description,
  title,
  confirmLabel = 'Eliminar',
  onOpenChange,
  onConfirm,
}: {
  target: ConfirmDeleteTarget | null
  isSubmitting: boolean
  error: Error | null
  description?: string
  title?: string
  confirmLabel?: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? `¿Eliminar ${target?.kind}?`}</DialogTitle>
          <DialogDescription>
            {description ??
              `«${target?.name}» se eliminará de forma permanente. Esta acción no se puede deshacer.`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ConfirmDeleteDialog
