import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import {
  addOrderItems,
  cancelOrder,
  createOrder,
  freeTable,
  getApiErrorMessage,
  getCategories,
  getOpenOrdersByTable,
  getOrders,
  getTables,
  payOrder,
  updateOrderStatus,
} from '@/lib/api'
import type {
  MenuProduct,
  Order,
  PaymentMethod,
  RestaurantTable,
} from '@/lib/api'
import { computeTotals, mergeLines, TAX_RATE } from '@/lib/cart'
import type { CartLine } from '@/lib/cart'
import {
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  OPEN_STATUSES,
  PAYMENT_METHOD_LABEL,
} from '@/lib/orderStatus'
import { formatCurrency } from '@/lib/format'
import { cn, normalizeSearch } from '@/lib/utils'
import { playChime } from '@/lib/notifications'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { printKitchenTicket, useOrganizationName } from '@/lib/print'
import {
  clearPosDraft,
  loadPosDraft,
  savePosDraft,
  type PosDraftTarget,
} from '@/lib/posDraft'
import { useAuthStore } from '@/stores/authStore'
import { OrderStatusTimeline } from '@/components/OrderStatusTimeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'

type Target = { kind: 'TABLE'; table: RestaurantTable } | { kind: 'TAKEOUT' }

function targetLabel(target: Target): string {
  return target.kind === 'TABLE' ? `Mesa ${target.table.number}` : 'Para llevar'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PosPage() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<Target | null>(null)
  const [lines, setLines] = useState<CartLine[]>(
    () => loadPosDraft()?.lines ?? [],
  )
  const [categoryId, setCategoryId] = useState('all')
  const [query, setQuery] = useState('')
  const [orderNotes, setOrderNotes] = useState(
    () => loadPosDraft()?.orderNotes ?? '',
  )
  const [payTarget, setPayTarget] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [addTarget, setAddTarget] = useState<Order | null>(null)
  const [addCart, setAddCart] = useState<CartLine[]>([])
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null)
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<Target | null>(null)
  const [draftTarget, setDraftTarget] = useState<PosDraftTarget | null>(
    () => loadPosDraft()?.target ?? null,
  )

  const tables = useQuery({
    queryKey: ['tables'],
    queryFn: getTables,
    refetchInterval: 5_000,
  })

  useEffect(() => {
    if (!draftTarget) return
    if (draftTarget.kind === 'TAKEOUT') {
      setTarget({ kind: 'TAKEOUT' })
      setDraftTarget(null)
      return
    }
    const table = (tables.data ?? []).find((t) => t.id === draftTarget.tableId)
    setDraftTarget(null)
    if (table) {
      setTarget({ kind: 'TABLE', table })
    } else {
      setLines([])
      setOrderNotes('')
      clearPosDraft()
    }
  }, [draftTarget, tables.data])

  useEffect(() => {
    if (lines.length > 0) {
      savePosDraft({
        target: target
          ? target.kind === 'TABLE'
            ? { kind: 'TABLE', tableId: target.table.id }
            : { kind: 'TAKEOUT' }
          : null,
        lines,
        orderNotes,
      })
    } else {
      clearPosDraft()
    }
  }, [target, lines, orderNotes])
  const categories = useQuery({
    queryKey: ['menu-categories'],
    queryFn: getCategories,
  })
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders(),
    refetchInterval: 5_000,
  })

  const tableId = target?.kind === 'TABLE' ? target.table.id : undefined
  const openForTable = useQuery({
    queryKey: ['orders', 'open', tableId ?? ''],
    queryFn: () => getOpenOrdersByTable(tableId as string),
    enabled: Boolean(tableId),
  })

  const totals = useMemo(() => computeTotals(lines), [lines])

  const activeOrders = useMemo(
    () => (orders.data ?? []).filter((o) => OPEN_STATUSES.includes(o.status)),
    [orders.data],
  )

  const awaitingOrders = useMemo(
    () => (orders.data ?? []).filter((o) => o.status === 'AWAITING_CONFIRMATION'),
    [orders.data],
  )

  const prevAwaitingIds = useRef('')
  useEffect(() => {
    const ids = awaitingOrders.map((o) => o.id).sort().join(',')
    if (!prevAwaitingIds.current) {
      prevAwaitingIds.current = ids
      return
    }
    const prev = new Set(
      prevAwaitingIds.current ? prevAwaitingIds.current.split(',') : [],
    )
    const current = new Set(ids ? ids.split(',') : [])
    const hasNew = [...current].some((id) => !prev.has(id))
    prevAwaitingIds.current = ids
    if (hasNew) playChime()
  }, [awaitingOrders])


  const canUpdate = user?.permissions.includes('orders:update') ?? false
  const canPay = user?.permissions.includes('orders:pay') ?? false
  const canCancel = user?.permissions.includes('orders:cancel') ?? false

  async function invalidateOrders() {
    await queryClient.invalidateQueries({ queryKey: ['orders'] })
    await queryClient.invalidateQueries({ queryKey: ['tables'] })
  }

  const create = useMutation({
    mutationFn: createOrder,
    onSuccess: async (order) => {
      setCreatedOrder(order)
      setLines([])
      setOrderNotes('')
      await invalidateOrders()
    },
    onError: (error) => toastError(error),
  })

  const markServed = useMutation({
    mutationFn: (id: string) => updateOrderStatus(id, 'SERVED'),
    onSuccess: invalidateOrders,
    onError: (error) => toastError(error),
  })

  const attend = useMutation({
    mutationFn: (id: string) => updateOrderStatus(id, 'PENDING'),
    onSuccess: invalidateOrders,
    onError: (error) => toastError(error),
  })

  const doCancel = useMutation({
    mutationFn: (id: string) => cancelOrder(id),
    onSuccess: async () => {
      setCancelTarget(null)
      await invalidateOrders()
    },
    onError: (error) => toastError(error),
  })

  const addItemsMutation = useMutation({
    mutationFn: ({ id, items }: { id: string; items: CartLine[] }) =>
      addOrderItems(id, {
        items: items.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          notes: line.notes || undefined,
        })),
      }),
    onSuccess: async () => {
      setAddTarget(null)
      setAddCart([])
      await invalidateOrders()
      toast.success('Productos agregados a la comanda')
    },
    onError: (error) => toastError(error),
  })

  const pay = useMutation({
    mutationFn: ({
      id,
      method,
      applyIgv,
    }: {
      id: string
      method: PaymentMethod
      applyIgv?: boolean
    }) => payOrder(id, method, applyIgv),
    onSuccess: async () => {
      setPayTarget(null)
      await invalidateOrders()
    },
    onError: (error) => toastError(error),
  })

  const freeTableMutation = useMutation({
    mutationFn: freeTable,
    onSuccess: async () => {
      await invalidateOrders()
      await queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
    onError: (error) => toastError(error),
  })

  function applyTarget(next: Target) {
    setTarget(next)
    setLines([])
    setCategoryId('all')
    setQuery('')
  }

  function handleSelectTarget(next: Target) {
    if (lines.length > 0) {
      setPendingTarget(next)
      return
    }
    applyTarget(next)
  }

  function addProduct(product: MenuProduct) {
    setLines((prev) =>
      mergeLines(prev, {
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
      }),
    )
  }

  function setQuantity(productId: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) =>
            l.productId === productId ? { ...l, quantity } : l,
          ),
    )
  }

  function setLineNotes(productId: string, notes: string) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, notes } : l)),
    )
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  function handleSubmit() {
    if (!target || lines.length === 0) return
    create.mutate({
      orderType: target.kind === 'TABLE' ? 'DINE_IN' : 'TAKEOUT',
      tableId: target.kind === 'TABLE' ? target.table.id : undefined,
      notes: orderNotes.trim() || undefined,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        notes: l.notes?.trim() || undefined,
      })),
    })
  }

  const activeCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.active),
    [categories.data],
  )
  const normalizedQuery = useMemo(() => normalizeSearch(query), [query])
  const currentCategories = activeCategories.filter(
    (c) =>
      normalizedQuery !== '' || categoryId === 'all' || c.id === categoryId,
  )
  const products = currentCategories.flatMap((c) =>
    c.products.filter(
      (p) =>
        p.active &&
        (normalizedQuery === '' ||
          normalizeSearch(p.name).includes(normalizedQuery)),
    ),
  )

  useEffect(() => {
    const hasModal = Boolean(
      payTarget || cancelTarget || pendingTarget || createdOrder,
    )
    function onKeyDown(e: KeyboardEvent) {
      if (hasModal) return
      const el = e.target as HTMLElement
      if (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT'
      ) {
        return
      }
      if (!/^[1-9]$/.test(e.key)) return
      const chips = ['all', ...activeCategories.map((c) => c.id)]
      const id = chips[Number(e.key) - 1]
      if (id) {
        setCategoryId(id)
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeCategories, payTarget, cancelTarget, pendingTarget, createdOrder])

  if (tables.isLoading || categories.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (tables.isError || categories.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">
          {getApiErrorMessage(tables.error ?? categories.error)}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            tables.refetch()
            categories.refetch()
          }}
        >
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Punto de venta</h1>
        <p className="text-sm text-muted-foreground">
          Arma la comanda, envíala a cocina y cobra al finalizar.
        </p>
      </div>

      {awaitingOrders.length > 0 && (
        <div className="space-y-2">
          {awaitingOrders.map((order) => {
            const itemCount = order.items.reduce((n, i) => n + i.quantity, 0)
            return (
              <div
                key={order.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-950/40"
              >
                <BellRing className="size-6 shrink-0 animate-pulse text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Mesa {order.table?.number ?? '—'} pidió por QR
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Comanda #{order.folio} · {itemCount} artículo
                    {itemCount === 1 ? '' : 's'} · {formatCurrency(order.total)}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="shrink-0"
                  onClick={() => attend.mutate(order.id)}
                  disabled={attend.isPending}
                >
                  {attend.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Atender y enviar a cocina
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <TargetSelector
            tables={tables.data ?? []}
            selected={target}
            onSelect={handleSelectTarget}
            onFree={(id) => freeTableMutation.mutate(id)}
          />

          {activeCategories.length === 0 ? (
            <Card>
              <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-muted-foreground">
                  Aún no hay categorías activas en el menú.
                </p>
                <p className="text-xs text-muted-foreground">
                  Activa categorías y productos desde la sección Menú.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && normalizedQuery) {
                      e.preventDefault()
                      const first = products[0]
                      if (first) addProduct(first)
                    }
                  }}
                  placeholder="Buscar producto…"
                  className="pl-9"
                  aria-label="Buscar producto"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter agrega el primer resultado · 1-9 cambia de categoría
              </p>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <CategoryChip
                  active={categoryId === 'all'}
                  onClick={() => {
                    setCategoryId('all')
                    setQuery('')
                  }}
                >
                  Todo
                </CategoryChip>
                {activeCategories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    active={categoryId === c.id}
                    onClick={() => {
                      setCategoryId(c.id)
                      setQuery('')
                    }}
                  >
                    {c.name}
                  </CategoryChip>
                ))}
              </div>

              {products.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {normalizedQuery
                    ? `Sin resultados para «${query.trim()}».`
                    : 'No hay productos activos en esta categoría.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {products.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="h-auto flex-col items-start gap-1 p-3 text-left"
                      onClick={() => addProduct(p)}
                    >
                      <span className="line-clamp-2 text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(p.price)}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="hidden lg:block">
          <TicketCard
            target={target}
            lines={lines}
            totals={totals}
            orderNotes={orderNotes}
            openOrders={openForTable.data ?? []}
            isSubmitting={create.isPending}
            error={create.error}
            onNotesChange={setOrderNotes}
            onQuantity={setQuantity}
            onLineNotes={setLineNotes}
            onRemoveLine={removeLine}
            onSubmit={handleSubmit}
          />
        </aside>
      </div>

      <MobileTicketSheet
        open={mobileTicketOpen}
        onOpenChange={setMobileTicketOpen}
        target={target}
        lines={lines}
        totals={totals}
        orderNotes={orderNotes}
        openOrders={openForTable.data ?? []}
        isSubmitting={create.isPending}
        error={create.error}
        onNotesChange={setOrderNotes}
        onQuantity={setQuantity}
        onLineNotes={setLineNotes}
        onRemoveLine={removeLine}
        onSubmit={handleSubmit}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Órdenes activas
        </h2>
        {orders.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : activeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay órdenes abiertas en este momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                canUpdate={canUpdate}
                canPay={canPay}
                canCancel={canCancel}
                canAddItems={
                  canUpdate &&
                  !['PAID', 'CANCELLED'].includes(order.status)
                }
                busy={
                  markServed.isPending ||
                  doCancel.isPending ||
                  pay.isPending ||
                  addItemsMutation.isPending
                }
                onMarkServed={() => markServed.mutate(order.id)}
                onCancel={() => setCancelTarget(order)}
                onPay={() => setPayTarget(order)}
                onAddItems={() => {
                  setAddTarget(order)
                  setAddCart([])
                }}
              />
            ))}
          </div>
        )}
      </section>

      <PayDialog
        key={payTarget?.id ?? 'none'}
        order={payTarget}
        isSubmitting={pay.isPending}
        error={pay.error}
        canApplyIgv={user?.role.name === 'ADMIN'}
        onOpenChange={(open) => {
          if (!open) setPayTarget(null)
        }}
        onConfirm={(method, applyIgv) => {
          if (payTarget) pay.mutate({ id: payTarget.id, method, applyIgv })
        }}
      />

      <ConfirmDeleteDialog
        target={
          cancelTarget
            ? {
                kind: 'orden',
                id: cancelTarget.id,
                name: `comanda #${cancelTarget.folio}`,
              }
            : null
        }
        title="¿Cancelar comanda?"
        description="La comanda se cancelará y la mesa quedará libre. Esta acción no se puede deshacer."
        confirmLabel="Cancelar comanda"
        isSubmitting={doCancel.isPending}
        error={doCancel.error}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
        onConfirm={() => {
          if (cancelTarget) doCancel.mutate(cancelTarget.id)
        }}
      />

      <CreatedDialog order={createdOrder} onClose={() => setCreatedOrder(null)} />

            <Dialog
        open={Boolean(addTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setAddTarget(null)
            setAddCart([])
          }
        }}
      >
        <DialogContent className="flex h-[95dvh] max-h-[95dvh] w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:w-full sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6">
            <DialogTitle>
              Agregar productos · Comanda #{addTarget?.folio ?? ''}
            </DialogTitle>
            <DialogDescription>
              {addTarget
                ? addTarget.orderType === 'DINE_IN' && addTarget.table
                  ? `Mesa ${addTarget.table.number}`
                  : 'Para llevar'
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 space-y-2 border-b px-4 py-2 sm:px-6">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar producto…"
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <CategoryChip
                    active={categoryId === 'all'}
                    onClick={() => {
                      setCategoryId('all')
                      setQuery('')
                    }}
                  >
                    Todo
                  </CategoryChip>
                  {activeCategories.map((c) => (
                    <CategoryChip
                      key={c.id}
                      active={categoryId === c.id}
                      onClick={() => {
                        setCategoryId(c.id)
                        setQuery('')
                      }}
                    >
                      {c.name}
                    </CategoryChip>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                  {products.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="h-auto flex-col items-start gap-1 p-3 text-left"
                      onClick={() => {
                        setAddCart((prev) =>
                          mergeLines(prev, {
                            id: `${p.id}-add-${Date.now()}-${Math.random()}`,
                            productId: p.id,
                            productName: p.name,
                            unitPrice: p.price,
                            quantity: 1,
                            notes: '',
                          }),
                        )
                      }}
                    >
                      <span className="line-clamp-2 text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(p.price)}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
              <div className="shrink-0 border-b p-3 sm:p-4">
                <p className="text-sm font-medium">Productos a agregar</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                {addCart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Agrega productos desde el catálogo
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {addCart.map((line) => (
                      <li
                        key={line.id}
                        className="flex items-start justify-between gap-2 rounded-md border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {line.productName}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-7"
                              onClick={() =>
                                setAddCart((prev) =>
                                  prev
                                    .map((l) =>
                                      l.id === line.id
                                        ? { ...l, quantity: Math.max(1, l.quantity - 1) }
                                        : l,
                                    )
                                    .filter((l) => l.quantity > 0),
                                )
                              }
                            >
                              <Minus className="size-3" />
                            </Button>
                            <span className="w-6 text-center text-sm tabular-nums">
                              {line.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-7"
                              onClick={() =>
                                setAddCart((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id
                                      ? { ...l, quantity: Math.min(99, l.quantity + 1) }
                                      : l,
                                  ),
                                )
                              }
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm tabular-nums">
                            {formatCurrency(line.unitPrice * line.quantity)}
                          </p>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground"
                            onClick={() =>
                              setAddCart((prev) =>
                                prev.filter((l) => l.id !== line.id),
                              )
                            }
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 border-t p-3 sm:p-4">
                <div className="mb-3 flex justify-between text-sm">
                  <span>Total a agregar</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(
                      addCart.reduce(
                        (sum, l) => sum + l.unitPrice * l.quantity,
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setAddTarget(null)
                      setAddCart([])
                    }}
                    disabled={addItemsMutation.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={addCart.length === 0 || addItemsMutation.isPending}
                    onClick={() => {
                      if (addTarget && addCart.length > 0) {
                        addItemsMutation.mutate({ id: addTarget.id, items: addCart })
                      }
                    }}
                  >
                    {addItemsMutation.isPending && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Confirmar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

<Dialog
        open={Boolean(pendingTarget)}
        onOpenChange={(open) => {
          if (!open) setPendingTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Descartar la comanda?</DialogTitle>
            <DialogDescription>
              {pendingTarget
                ? `Cambiar a «${targetLabel(pendingTarget)}» descartará los ${totals.itemCount} artículo${totals.itemCount === 1 ? '' : 's'} que llevas armados.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (pendingTarget) applyTarget(pendingTarget)
                setPendingTarget(null)
              }}
            >
              Cambiar y descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {target ? targetLabel(target) : 'Selecciona mesa o para llevar'}
            </p>
            <p className="truncate text-sm text-muted-foreground tabular-nums">
              {lines.length > 0
                ? `${totals.itemCount} artículo${totals.itemCount === 1 ? '' : 's'} · ${formatCurrency(totals.total)}`
                : 'Comanda vacía'}
            </p>
          </div>
          <Button
            size="lg"
            className="shrink-0"
            disabled={!target || lines.length === 0}
            onClick={() => setMobileTicketOpen(true)}
          >
            <ReceiptText className="size-4" />
            Ver comanda
          </Button>
        </div>
      </div>
    </div>
  )
}

function TargetSelector({
  tables,
  selected,
  onSelect,
  onFree,
}: {
  tables: RestaurantTable[]
  selected: Target | null
  onSelect: (target: Target) => void
  onFree: (tableId: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 lg:grid-cols-5">
      <Button
        variant={selected?.kind === 'TAKEOUT' ? 'default' : 'outline'}
        className="h-16 flex-col items-center justify-center gap-1.5 px-1"
        onClick={() => onSelect({ kind: 'TAKEOUT' })}
      >
        <ShoppingBag className="size-4" />
        <span className="truncate text-xs">Para llevar</span>
      </Button>
      {tables.map((table) => {
        const isSelected =
          selected?.kind === 'TABLE' && selected.table.id === table.id
        const isOccupied = table.status === 'OCCUPIED'
        return (
          <div key={table.id} className="relative group">
            <Button
              variant={isSelected ? 'default' : 'outline'}
              className={cn(
                'h-16 w-full flex-col items-center justify-center gap-1.5 px-1',
                !isSelected &&
                  isOccupied &&
                  'border-amber-400 text-amber-700 dark:border-amber-500 dark:text-amber-400',
              )}
              onClick={() => onSelect({ kind: 'TABLE', table })}
            >
              <UtensilsCrossed className="size-4" />
              <span className="truncate text-xs">Mesa {table.number}</span>
            </Button>
            {isOccupied && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onFree(table.id)
                }}
                title="Liberar mesa"
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

function TicketCard({
  target,
  lines,
  totals,
  orderNotes,
  openOrders,
  isSubmitting,
  error,
  onNotesChange,
  onQuantity,
  onLineNotes,
  onRemoveLine,
  onSubmit,
}: TicketBodyProps) {
  return (
    <Card className="flex h-fit flex-col lg:sticky lg:top-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="size-5" />
          {target ? targetLabel(target) : 'Comanda'}
        </CardTitle>
        {target?.kind === 'TABLE' && target.table.status !== 'FREE' && (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
            Ocupada
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <TicketBody
          target={target}
          lines={lines}
          totals={totals}
          orderNotes={orderNotes}
          openOrders={openOrders}
          isSubmitting={isSubmitting}
          error={error}
          onNotesChange={onNotesChange}
          onQuantity={onQuantity}
          onLineNotes={onLineNotes}
          onRemoveLine={onRemoveLine}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  )
}

interface TicketBodyProps {
  target: Target | null
  lines: CartLine[]
  totals: { subtotal: number; tax: number; total: number; itemCount: number }
  orderNotes: string
  openOrders: Order[]
  isSubmitting: boolean
  error: Error | null
  onNotesChange: (value: string) => void
  onQuantity: (productId: string, quantity: number) => void
  onLineNotes: (productId: string, notes: string) => void
  onRemoveLine: (productId: string) => void
  onSubmit: () => void
}

function TicketBody({
  target,
  lines,
  totals,
  orderNotes,
  openOrders,
  isSubmitting,
  error,
  onNotesChange,
  onQuantity,
  onLineNotes,
  onRemoveLine,
  onSubmit,
}: TicketBodyProps) {
  return (
    <>
      {!target ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Selecciona una mesa o «Para llevar» para comenzar.
        </p>
      ) : (
        <>
          {openOrders.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Comandas abiertas de la mesa
              </p>
              {openOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="font-medium">#{o.folio}</span>
                  <Badge
                    variant={ORDER_STATUS_BADGE[o.status].variant}
                    className={ORDER_STATUS_BADGE[o.status].className}
                  >
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatCurrency(o.total)}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Al enviar este ticket se creará una comanda adicional en la
                misma mesa.
              </p>
            </div>
          )}

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              El ticket está vacío. Toca un producto del menú para agregarlo.
            </p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li key={line.productId} className="rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {line.productName}
                    </p>
                    <p className="text-sm tabular-nums">
                      {formatCurrency(line.unitPrice * line.quantity)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => onRemoveLine(line.productId)}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Quitar {line.productName}</span>
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-6"
                        onClick={() =>
                          onQuantity(line.productId, line.quantity - 1)
                        }
                        disabled={line.quantity <= 1}
                      >
                        <Minus className="size-3" />
                        <span className="sr-only">Menos</span>
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-6"
                        onClick={() =>
                          onQuantity(line.productId, line.quantity + 1)
                        }
                      >
                        <Plus className="size-3" />
                        <span className="sr-only">Más</span>
                      </Button>
                    </div>
                    <Input
                      value={line.notes ?? ''}
                      onChange={(e) =>
                        onLineNotes(line.productId, e.target.value)
                      }
                      placeholder="Nota (opcional)"
                      className="h-8 text-xs"
                      maxLength={200}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Textarea
            value={orderNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Notas de la comanda (opcional)"
            maxLength={300}
            rows={2}
          />

          <dl className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(totals.subtotal)}</dd>
            </div>
            {totals.tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>IGV (16%)</dt>
                <dd className="tabular-nums">{formatCurrency(totals.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
            </div>
          </dl>

          {error && (
            <p className="text-sm text-destructive">
              {getApiErrorMessage(error)}
            </p>
          )}

          <Button
            className="w-full"
            disabled={!target || lines.length === 0 || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Enviar a cocina
          </Button>
        </>
      )}
    </>
  )
}

function MobileTicketSheet({
  open,
  onOpenChange,
  ...ticket
}: TicketBodyProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-3 pr-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-5" />
            {ticket.target ? targetLabel(ticket.target) : 'Comanda'}
          </DialogTitle>
          {ticket.target?.kind === 'TABLE' &&
            ticket.target.table.status !== 'FREE' && (
              <Badge
                variant="outline"
                className="text-amber-700 dark:text-amber-400"
              >
                Ocupada
              </Badge>
            )}
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
          <TicketBody {...ticket} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OrderCard({
  order,
  canUpdate,
  canPay,
  canCancel,
  canAddItems,
  busy,
  onMarkServed,
  onCancel,
  onPay,
  onAddItems,
}: {
  order: Order
  canUpdate: boolean
  canPay: boolean
  canCancel: boolean
  canAddItems: boolean
  busy: boolean
  onMarkServed: () => void
  onCancel: () => void
  onPay: () => void
  onAddItems: () => void
}) {
  const badge = ORDER_STATUS_BADGE[order.status]
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">
            <span className="truncate">
              Comanda #{order.folio}
              <span className="ml-2 font-normal text-muted-foreground">
                {order.orderType === 'DINE_IN' && order.table
                  ? `Mesa ${order.table.number}`
                  : 'Para llevar'}
              </span>
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={badge.variant} className={badge.className}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
            <span>{formatTime(order.createdAt)}</span>
            {order.createdBy && <span>· {order.createdBy.name}</span>}
          </div>
        </div>
        <p className="text-lg font-semibold tabular-nums">
          {formatCurrency(order.total)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {order.notes && (
          <p className="text-sm text-muted-foreground">«{order.notes}»</p>
        )}
        <ul className="space-y-1">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span>
                <span className="font-medium">
                  {item.quantity}× {item.productName}
                </span>
                {item.notes && (
                  <span className="ml-1 text-muted-foreground">
                    ({item.notes})
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <OrderStatusTimeline order={order} />
        <div className="flex flex-wrap gap-2">
          {order.status === 'READY' && canUpdate && (
            <Button size="sm" onClick={onMarkServed} disabled={busy}>
              Marcar servida
            </Button>
          )}
          {canAddItems && (
            <Button size="sm" variant="outline" onClick={onAddItems} disabled={busy}>
              Agregar productos
            </Button>
          )}
          {canPay && (
            <Button size="sm" variant="outline" onClick={onPay} disabled={busy}>
              Cobrar
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PayDialog({
  order,
  isSubmitting,
  error,
  canApplyIgv,
  onOpenChange,
  onConfirm,
}: {
  order: Order | null
  isSubmitting: boolean
  error: Error | null
  canApplyIgv: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (method: PaymentMethod, applyIgv?: boolean) => void
}) {
  const [applyIgv, setApplyIgv] = useState(false)

  const display = useMemo(() => {
    if (!order) return null
    const subtotalCents = Math.round(order.subtotal * 100)
    const taxCents = applyIgv ? Math.round(subtotalCents * TAX_RATE) : 0
    return {
      subtotal: subtotalCents / 100,
      tax: taxCents / 100,
      total: (subtotalCents + taxCents) / 100,
    }
  }, [order, applyIgv])

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Cobrar comanda #{order?.folio ?? ''}
          </DialogTitle>
          <DialogDescription>
            {order
              ? `${order.orderType === 'DINE_IN' && order.table ? `Mesa ${order.table.number}` : 'Para llevar'} · ${ORDER_STATUS_LABEL[order.status]}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {order && display && (
          <div className="space-y-4 py-4">
            <dl className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatCurrency(display.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>IGV (16%)</dt>
                <dd className="tabular-nums">{formatCurrency(display.tax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(display.total)}</dd>
              </div>
            </dl>

            {canApplyIgv && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Aplicar IGV (16%)</p>
                  <p className="text-xs text-muted-foreground">
                    Solo se cobra impuesto en esta venta.
                  </p>
                </div>
                <Switch
                  checked={applyIgv}
                  onCheckedChange={setApplyIgv}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(
                (method) => (
                  <Button
                    key={method}
                    variant="outline"
                    className="h-12"
                    disabled={isSubmitting}
                    onClick={() => onConfirm(method, applyIgv)}
                  >
                    {PAYMENT_METHOD_LABEL[method]}
                  </Button>
                ),
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(error)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatedDialog({
  order,
  onClose,
}: {
  order: Order | null
  onClose: () => void
}) {
  const orgName = useOrganizationName()

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            Comanda enviada
          </DialogTitle>
          <DialogDescription>
            {order
              ? `La comanda #${order.folio} se envió a cocina por ${formatCurrency(order.total)}.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!order}
            onClick={() => order && printKitchenTicket(order, orgName)}
          >
            <Printer className="size-4" />
            Imprimir comanda
          </Button>
          <Button onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PosPage
