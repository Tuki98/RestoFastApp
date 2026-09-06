import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Minus,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  createIngredient,
  deleteIngredient,
  getInventoryAlerts,
  getInventoryMovements,
  getIngredients,
  registerEntry,
  registerExit,
  updateIngredient,
  type CreateEntryPayload,
  type CreateExitPayload,
  type CreateIngredientPayload,
  type Ingredient,
  type InventoryAlert,
  type InventoryAlertType,
  type InventoryMovement,
  type InventoryArea,
  INVENTORY_AREA_LABEL,
  type UpdateIngredientPayload,
} from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'

const ALERT_STYLES: Record<InventoryAlertType, string> = {
  EXPIRED: 'border-red-300 bg-red-500/15 text-red-700 dark:border-red-700 dark:text-red-400',
  EXPIRING_SOON:
    'border-amber-300 bg-amber-500/15 text-amber-700 dark:border-amber-700 dark:text-amber-400',
  LOW_STOCK:
    'border-orange-300 bg-orange-500/15 text-orange-700 dark:border-orange-700 dark:text-orange-400',
}

function todayLocalISO(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function lotState(lot: Ingredient['lots'][number]) {
  if (lot.remaining === 0) {
    return { label: 'Agotado', variant: 'secondary' as const }
  }
  if (lot.alert === 'EXPIRED') {
    return { label: 'Caducado', variant: 'destructive' as const }
  }
  if (lot.alert === 'EXPIRING_SOON') {
    return { label: 'Por caducar', variant: 'outline' as const, style: ALERT_STYLES.EXPIRING_SOON }
  }
  return { label: 'Vigente', variant: 'outline' as const }
}

function InventoryPage() {
  const queryClient = useQueryClient()
  const [ingredientDialog, setIngredientDialog] = useState<{
    open: boolean
    ingredient: Ingredient | null
  }>({ open: false, ingredient: null })
  const [movement, setMovement] = useState<{
    mode: 'entry' | 'exit'
    ingredient: Ingredient
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [area, setArea] = useState<InventoryArea>('BARRA')

  const { data: ingredients, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ingredients', area],
    queryFn: () => getIngredients(area),
  })

  const { data: alerts } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: getInventoryAlerts,
  })

  const { data: movements } = useQuery({
    queryKey: ['inventory-movements', area],
    queryFn: () => getInventoryMovements(area),
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ingredients'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-alerts'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
    ])
  }

  const saveIngredient = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateIngredientPayload | UpdateIngredientPayload
    }) =>
      id
        ? updateIngredient(id, payload as UpdateIngredientPayload)
        : createIngredient(payload as CreateIngredientPayload),
    onSuccess: async () => {
      await invalidate()
      setIngredientDialog({ open: false, ingredient: null })
      toast.success('Insumo guardado')
    },
    onError: (error) => toastError(error),
  })

  const addMovement = useMutation({
    mutationFn: async ({
      mode,
      ingredientId,
      payload,
    }: {
      mode: 'entry' | 'exit'
      ingredientId: string
      payload: CreateEntryPayload | CreateExitPayload
    }) => {
      if (mode === 'entry') {
        await registerEntry(ingredientId, payload as CreateEntryPayload)
      } else {
        await registerExit(ingredientId, payload as CreateExitPayload)
      }
    },
    onSuccess: async () => {
      await invalidate()
      setMovement(null)
      toast.success('Movimiento registrado')
    },
    onError: (error) => toastError(error),
  })

  const remove = useMutation({
    mutationFn: () => deleteIngredient(deleteTarget!.id),
    onSuccess: async () => {
      await invalidate()
      setDeleteTarget(null)
      toast.success('Insumo eliminado')
    },
    onError: (error) => toastError(error),
  })

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-52" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
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
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Ingredientes, cargas con caducidad y movimientos de stock.
          </p>
        </div>
        <Button
          onClick={() =>
            setIngredientDialog({ open: true, ingredient: null })
          }
        >
          <Plus className="size-4" />
          Nuevo ingrediente ({INVENTORY_AREA_LABEL[area]})
        </Button>
      </div>

      <div className="inline-flex rounded-lg border bg-card p-1">
        {(['BARRA', 'COCINA'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setArea(option)
              setExpanded(new Set())
            }}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              area === option
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {INVENTORY_AREA_LABEL[option]}
          </button>
        ))}
      </div>

      <AlertsBanner alerts={alerts} area={area} />

      {ingredients?.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-center">
          <Package className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            Aún no hay ingredientes en{' '}
            {INVENTORY_AREA_LABEL[area].toLowerCase()}.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              setIngredientDialog({ open: true, ingredient: null })
            }
          >
            <Plus className="size-4" />
            Nuevo ingrediente
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ingredients?.map((ingredient) => (
            <IngredientCard
              key={ingredient.id}
              ingredient={ingredient}
              expanded={expanded.has(ingredient.id)}
              onToggle={() => toggleExpand(ingredient.id)}
              onEntry={() => setMovement({ mode: 'entry', ingredient })}
              onExit={() => setMovement({ mode: 'exit', ingredient })}
              onEdit={() =>
                setIngredientDialog({ open: true, ingredient })
              }
              onDelete={() => setDeleteTarget(ingredient)}
            />
          ))}
        </div>
      )}

      {movements && movements.length > 0 && (
        <MovementsTable movements={movements} />
      )}

      <IngredientDialog
        open={ingredientDialog.open}
        ingredient={ingredientDialog.ingredient}
        defaultArea={area}
        onOpenChange={(open) =>
          setIngredientDialog((s) => ({ ...s, open }))
        }
        isSubmitting={saveIngredient.isPending}
        error={saveIngredient.error}
        onSubmit={(payload) =>
          saveIngredient.mutate({
            id: ingredientDialog.ingredient?.id,
            payload,
          })
        }
      />

      {movement && (
        <MovementDialog
          mode={movement.mode}
          ingredient={movement.ingredient}
          onOpenChange={(open) => !open && setMovement(null)}
          isSubmitting={addMovement.isPending}
          error={addMovement.error}
          onSubmit={(payload) =>
            addMovement.mutate({
              mode: movement.mode,
              ingredientId: movement.ingredient.id,
              payload,
            })
          }
        />
      )}

      <ConfirmDeleteDialog
        target={
          deleteTarget
            ? {
                kind: 'ingrediente',
                id: deleteTarget.id,
                name: deleteTarget.name,
              }
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

function AlertsBanner({
  alerts,
  area,
}: {
  alerts?: InventoryAlert[]
  area: InventoryArea
}) {
  const groups = useMemo(() => {
    const result: Record<string, InventoryAlert[]> = {
      EXPIRED: [],
      EXPIRING_SOON: [],
      LOW_STOCK: [],
    }
    for (const alert of alerts ?? []) {
      if (alert.ingredient.area !== area) continue
      result[alert.type]?.push(alert)
    }
    return result
  }, [alerts, area])

  const hasAny = Object.values(groups).some((group) => group.length > 0)
  if (!hasAny) return null

  return (
    <div className="space-y-2">
      {groups.EXPIRED.length > 0 && (
        <AlertSection
          tone="EXPIRED"
          icon={<AlertTriangle className="size-4" />}
          title="Lotes caducados"
        >
          {groups.EXPIRED.map((alert) => (
            <AlertItem
              key={alert.lot?.id}
              name={alert.ingredient.name}
              detail={`Lote del ${alert.lot ? formatDate(alert.lot.receivedAt) : ''} — caducó hace ${Math.abs(alert.daysLeft ?? 0)} día${Math.abs(alert.daysLeft ?? 0) === 1 ? '' : 's'}`}
            />
          ))}
        </AlertSection>
      )}

      {groups.EXPIRING_SOON.length > 0 && (
        <AlertSection
          tone="EXPIRING_SOON"
          icon={<Clock className="size-4" />}
          title="Caducan pronto (2 días o menos)"
        >
          {groups.EXPIRING_SOON.map((alert) => (
            <AlertItem
              key={alert.lot?.id}
              name={alert.ingredient.name}
              detail={`Lote del ${alert.lot ? formatDate(alert.lot.receivedAt) : ''} — caduca en ${alert.daysLeft ?? 0} día${alert.daysLeft === 1 ? '' : 's'}`}
            />
          ))}
        </AlertSection>
      )}

      {groups.LOW_STOCK.length > 0 && (
        <AlertSection
          tone="LOW_STOCK"
          icon={<Package className="size-4" />}
          title="Stock bajo"
        >
          {groups.LOW_STOCK.map((alert, i) => (
            <AlertItem
              key={`${alert.ingredient.id}-${i}`}
              name={alert.ingredient.name}
              detail={`${formatNumber(alert.stock ?? 0)} ${alert.ingredient.unit} (mínimo ${formatNumber(alert.minStock ?? 0)} ${alert.ingredient.unit})`}
            />
          ))}
        </AlertSection>
      )}
    </div>
  )
}

function AlertSection({
  tone,
  icon,
  title,
  children,
}: {
  tone: InventoryAlertType
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          tone === 'EXPIRED' && 'text-red-700 dark:text-red-400',
          tone === 'EXPIRING_SOON' && 'text-amber-700 dark:text-amber-400',
          tone === 'LOW_STOCK' && 'text-orange-700 dark:text-orange-400',
        )}
      >
        {icon}
        {title}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

function AlertItem({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="flex flex-wrap gap-x-2 text-sm">
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">{detail}</span>
    </li>
  )
}

function IngredientCard({
  ingredient,
  expanded,
  onToggle,
  onEntry,
  onExit,
  onEdit,
  onDelete,
}: {
  ingredient: Ingredient
  expanded: boolean
  onToggle: () => void
  onEntry: () => void
  onExit: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const hasExpiring = ingredient.lots.some(
    (lot) => lot.alert === 'EXPIRING_SOON',
  )
  const hasExpired = ingredient.lots.some((lot) => lot.alert === 'EXPIRED')
  const activeLots = ingredient.lots.filter(
    (lot) => lot.alert === 'EXPIRING_SOON' || lot.alert === 'EXPIRED',
  ).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-lg">{ingredient.name}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              {INVENTORY_AREA_LABEL[ingredient.area]}
            </Badge>
            {!ingredient.active && <Badge variant="outline">Inactivo</Badge>}
            {hasExpired && <Badge variant="destructive">Lote caducado</Badge>}
            {hasExpiring && (
              <Badge variant="outline" className={ALERT_STYLES.EXPIRING_SOON}>
                Por caducar
              </Badge>
            )}
            {ingredient.lowStock && (
              <Badge variant="outline" className={ALERT_STYLES.LOW_STOCK}>
                Stock bajo
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          <span className="sr-only">Ver lotes</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {formatNumber(ingredient.stock)}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                {ingredient.unit}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Mínimo {formatNumber(ingredient.minStock)} {ingredient.unit}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              {ingredient.shelfLifeDays
                ? `Vida útil: ${ingredient.shelfLifeDays} días`
                : 'Sin caducidad'}
            </p>
            <p>
              {ingredient.lots.length}{' '}
              {ingredient.lots.length === 1 ? 'lote' : 'lotes'}
              {activeLots > 0 ? ` · ${activeLots} con alerta` : ''}
            </p>
          </div>
        </div>

        {expanded && (
          <LotsTable ingredient={ingredient} />
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onEntry}>
            <Plus className="size-4" />
            Entrada
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExit}
            disabled={ingredient.stock <= 0}
          >
            <Minus className="size-4" />
            Salida
          </Button>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="size-4" />
              <span className="sr-only">Editar</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="size-4" />
              <span className="sr-only">Eliminar</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LotsTable({ ingredient }: { ingredient: Ingredient }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ingreso</TableHead>
          <TableHead>Caducidad</TableHead>
          <TableHead className="text-right">Disponible</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ingredient.lots.map((lot) => {
          const state = lotState(lot)
          return (
            <TableRow key={lot.id}>
              <TableCell>{formatDate(lot.receivedAt)}</TableCell>
              <TableCell>
                {lot.expiresAt ? formatDate(lot.expiresAt) : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(lot.remaining)} / {formatNumber(lot.quantity)}
              </TableCell>
              <TableCell>
                <Badge variant={state.variant} className={state.style}>
                  {state.label}
                  {lot.alert && lot.daysLeft !== null && lot.remaining > 0
                    ? ` · ${Math.abs(lot.daysLeft)} día${Math.abs(lot.daysLeft) === 1 ? '' : 's'}`
                    : ''}
                </Badge>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function MovementsTable({ movements }: { movements: InventoryMovement[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Movimientos recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ingrediente</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.slice(0, 50).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{formatDate(movement.createdAt)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        movement.type === 'IN' ? 'secondary' : 'outline'
                      }
                    >
                      {movement.type === 'IN' ? 'Entrada' : 'Salida'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {movement.ingredient.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {movement.ingredient.unit}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {INVENTORY_AREA_LABEL[movement.area]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {movement.type === 'IN' ? '+' : '−'}
                    {formatNumber(movement.quantity)} {movement.ingredient.unit}
                  </TableCell>
                  <TableCell>{movement.user.name}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">
                    {movement.note ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="divide-y lg:hidden">
          {movements.slice(0, 50).map((movement) => (
            <li
              key={movement.id}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Badge variant={movement.type === 'IN' ? 'secondary' : 'outline'}>
                    {movement.type === 'IN' ? 'Entrada' : 'Salida'}
                  </Badge>
                  <span className="truncate">{movement.ingredient.name}</span>
                  <Badge variant="outline">
                    {INVENTORY_AREA_LABEL[movement.area]}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(movement.createdAt)} · {movement.user.name}
                </p>
                {movement.note && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {movement.note}
                  </p>
                )}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {movement.type === 'IN' ? '+' : '−'}
                {formatNumber(movement.quantity)} {movement.ingredient.unit}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function IngredientDialog({
  open,
  ingredient,
  defaultArea,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  ingredient: Ingredient | null
  defaultArea: InventoryArea
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateIngredientPayload) => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [minStock, setMinStock] = useState('0')
  const [shelfLifeDays, setShelfLifeDays] = useState('')
  const [active, setActive] = useState(true)
  const [area, setArea] = useState<InventoryArea>(defaultArea)

  const editing = Boolean(ingredient)

  function reset() {
    setName(ingredient?.name ?? '')
    setUnit(ingredient?.unit ?? '')
    setArea(ingredient?.area ?? defaultArea)
    setMinStock(String(ingredient?.minStock ?? 0))
    setShelfLifeDays(
      ingredient?.shelfLifeDays ? String(ingredient.shelfLifeDays) : '',
    )
    setActive(ingredient?.active ?? true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      unit: unit.trim(),
      area,
      minStock: minStock === '' ? 0 : Number(minStock),
      ...(shelfLifeDays === ''
        ? {}
        : { shelfLifeDays: Number(shelfLifeDays) }),
      ...(editing ? { active } : {}),
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
            <DialogTitle>
              {editing ? 'Editar ingrediente' : 'Nuevo ingrediente'}
            </DialogTitle>
            <DialogDescription>
              La vida útil se usa para calcular la caducidad de cada carga.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ingredient-name">Nombre</Label>
                <Input
                  id="ingredient-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Huevo"
                  maxLength={80}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ingredient-unit">Unidad</Label>
                <Input
                  id="ingredient-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="kg, l, pza, gr..."
                  maxLength={20}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Área</Label>
              <div className="inline-flex rounded-lg border bg-card p-1">
                {(['BARRA', 'COCINA'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setArea(option)}
                    className={cn(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                      area === option
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {INVENTORY_AREA_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ingredient-min-stock">
                  Stock mínimo (alerta)
                </Label>
                <Input
                  id="ingredient-min-stock"
                  type="number"
                  min={0}
                  step={0.001}
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ingredient-shelf-life">
                  Vida útil (días)
                </Label>
                <Input
                  id="ingredient-shelf-life"
                  type="number"
                  min={1}
                  value={shelfLifeDays}
                  onChange={(e) => setShelfLifeDays(e.target.value)}
                  placeholder="Opcional"
                />
                <p className="text-xs text-muted-foreground">
                  Al registrar una entrada, la caducidad será ingreso + días.
                </p>
              </div>
            </div>

            {editing && (
              <div className="flex items-center justify-between">
                <Label htmlFor="ingredient-active">Activo</Label>
                <Switch
                  id="ingredient-active"
                  checked={active}
                  onCheckedChange={setActive}
                />
              </div>
            )}

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
              {editing ? 'Guardar cambios' : 'Crear ingrediente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MovementDialog({
  mode,
  ingredient,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  mode: 'entry' | 'exit'
  ingredient: Ingredient
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateEntryPayload | CreateExitPayload) => void
}) {
  const isEntry = mode === 'entry'
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [receivedAt, setReceivedAt] = useState(todayLocalISO())
  const [clientError, setClientError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setClientError('La cantidad debe ser mayor a cero')
      return
    }
    if (!isEntry && qty > ingredient.stock) {
      setClientError(
        `Stock insuficiente: solo hay ${formatNumber(ingredient.stock)} ${ingredient.unit}`,
      )
      return
    }
    setClientError(null)
    onSubmit({
      quantity: qty,
      note: note.trim() || undefined,
      ...(isEntry ? { receivedAt } : {}),
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEntry ? 'Registrar entrada' : 'Registrar salida'}
            </DialogTitle>
            <DialogDescription>
              {ingredient.name} — Stock actual:{' '}
              {formatNumber(ingredient.stock)} {ingredient.unit}.
              {isEntry
                ? ' Se creará un lote y empezará el conteo de caducidad.'
                : ' Se consumirán primero los lotes que caducan antes (FEFO).'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="movement-quantity">
                  Cantidad ({ingredient.unit})
                </Label>
                <Input
                  id="movement-quantity"
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              {isEntry && (
                <div className="space-y-2">
                  <Label htmlFor="movement-received">Fecha de ingreso</Label>
                  <Input
                    id="movement-received"
                    type="date"
                    value={receivedAt}
                    max={todayLocalISO()}
                    onChange={(e) => setReceivedAt(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="movement-note">Nota</Label>
              <Textarea
                id="movement-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opcional — proveedor, motivo..."
                maxLength={300}
                rows={2}
              />
            </div>
            {(clientError || error) && (
              <p className="text-sm text-destructive">
                {clientError ?? getApiErrorMessage(error)}
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
              {isEntry ? 'Registrar entrada' : 'Registrar salida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InventoryPage
