import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, QrCode, Trash2, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  createTable,
  deleteTable,
  getTables,
  updateTable,
  type RestaurantTable,
  type TableStatus,
  type CreateTablePayload,
  type UpdateTablePayload,
} from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'

const STATUS_LABEL: Record<TableStatus, string> = {
  FREE: 'Libre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
}

function TablesPage() {
  const queryClient = useQueryClient()
  const [tableDialog, setTableDialog] = useState<{
    open: boolean
    table: RestaurantTable | null
  }>({ open: false, table: null })
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<
    RestaurantTable | null
  >(null)

  const { data: tables, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tables'],
    queryFn: getTables,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tables'] })

  const saveTable = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateTablePayload | UpdateTablePayload
    }) =>
      id
        ? updateTable(id, payload as UpdateTablePayload)
        : createTable(payload as CreateTablePayload),
    onSuccess: async () => {
      await invalidate()
      setTableDialog({ open: false, table: null })
      toast.success('Mesa guardada')
    },
    onError: (error) => toastError(error),
  })

  const remove = useMutation({
    mutationFn: () => deleteTable(deleteTarget!.id),
    onSuccess: async () => {
      await invalidate()
      setDeleteTarget(null)
      toast.success('Mesa eliminada')
    },
    onError: (error) => toastError(error),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">{getApiErrorMessage(error)}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mesas</h1>
          <p className="text-sm text-muted-foreground">
            Administra las mesas y genera sus códigos QR para la carta.
          </p>
        </div>
        <Button onClick={() => setTableDialog({ open: true, table: null })}>
          <Plus className="size-4" />
          Nueva mesa
        </Button>
      </div>

      {tables?.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-center">
          <p className="text-muted-foreground">Aún no hay mesas.</p>
          <Button
            variant="outline"
            onClick={() => setTableDialog({ open: true, table: null })}
          >
            <Plus className="size-4" />
            Nueva mesa
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tables?.map((table) => (
            <Card key={table.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Mesa {table.number}</CardTitle>
                <Badge
                  variant={
                    table.status === 'FREE' ? 'secondary' : 'default'
                  }
                >
                  {STATUS_LABEL[table.status]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" />
                    {table.seats} {table.seats === 1 ? 'asiento' : 'asientos'}
                  </span>
                  <span>{table.section}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTableDialog({ open: true, table })}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Editar mesa</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(table)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Eliminar mesa</span>
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setQrTable(table)}>
                    <QrCode className="size-4" />
                    QR
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TableDialog
        open={tableDialog.open}
        table={tableDialog.table}
        onOpenChange={(open) => setTableDialog((s) => ({ ...s, open }))}
        isSubmitting={saveTable.isPending}
        error={saveTable.error}
        onSubmit={(payload) =>
          saveTable.mutate({ id: tableDialog.table?.id, payload })
        }
      />

      <QrDialog table={qrTable} onOpenChange={setQrTable} />

      <ConfirmDeleteDialog
        target={
          deleteTarget
            ? { kind: 'mesa', id: deleteTarget.id, name: `Mesa ${deleteTarget.number}` }
            : null
        }
        isSubmitting={remove.isPending}
        error={remove.error}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}

function TableDialog({
  open,
  table,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  table: RestaurantTable | null
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateTablePayload) => void
}) {
  const [number, setNumber] = useState('1')
  const [seats, setSeats] = useState('2')
  const [section, setSection] = useState('Interior')

  const editing = Boolean(table)

  function reset() {
    setNumber(String(table?.number ?? 1))
    setSeats(String(table?.seats ?? 2))
    setSection(table?.section ?? 'Interior')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      number: Number(number),
      seats: Number(seats),
      section: section.trim() || 'Interior',
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de la mesa.'
                : 'El código QR se genera automáticamente al crear la mesa.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="table-number">Número</Label>
                <Input
                  id="table-number"
                  type="number"
                  min={1}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="table-seats">Asientos</Label>
                <Input
                  id="table-seats"
                  type="number"
                  min={1}
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-section">Sección</Label>
              <Input
                id="table-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="Ej. Interior, Terraza, Bar..."
                maxLength={60}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(error)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear mesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QrDialog({
  table,
  onOpenChange,
}: {
  table: RestaurantTable | null
  onOpenChange: (table: RestaurantTable | null) => void
}) {
  const url = table
    ? `${window.location.origin}/menu/${table.qrToken}`
    : ''

  function handleCopy() {
    navigator.clipboard?.writeText(url)
  }

  return (
    <Dialog open={Boolean(table)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carta de la mesa {table?.number}</DialogTitle>
          <DialogDescription>
            Escanea el código para abrir la carta. Los clientes pueden pedir
            desde su teléfono.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {table && (
            <div className="rounded-lg border bg-white p-4">
              <QRCodeSVG value={url} size={200} />
            </div>
          )}
          <div className="flex w-full items-center gap-2">
            <Input value={url} readOnly className="flex-1" />
            <Button variant="outline" onClick={handleCopy}>
              Copiar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(null)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TablesPage
