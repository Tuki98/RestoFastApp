import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Loader2,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Send,
  ShoppingBag,
  Trash2,
  UserRound,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react'
import {
  createOrderFromQr,
  getApiErrorMessage,
  getOrderStatusFromQr,
  getPublicMenuByToken,
  occupyTableByToken,
} from '@/lib/api'
import type { MenuProduct, Order, OrderStatus } from '@/lib/api'
import { computeTotals } from '@/lib/cart'
import type { CartLine } from '@/lib/cart'
import { formatCurrency } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const STORAGE_KEY_PREFIX = 'qr-order-'

type StoredOrder = { orderId: string; customerToken: string }

function loadStoredOrder(qrToken: string): StoredOrder | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + qrToken)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredOrder>
    if (
      parsed &&
      typeof parsed.orderId === 'string' &&
      typeof parsed.customerToken === 'string'
    ) {
      return parsed as StoredOrder
    }
    return null
  } catch {
    return null
  }
}

function saveStoredOrder(qrToken: string, order: StoredOrder) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PREFIX + qrToken,
      JSON.stringify(order),
    )
  } catch {
    // sin espacio disponible: el pedido igual se muestra por una sesión
  }
}

function clearStoredOrder(qrToken: string) {
  try {
    window.localStorage.removeItem(STORAGE_KEY_PREFIX + qrToken)
  } catch {
    // noop
  }
}

const CUSTOMER_STATUS: Record<OrderStatus, { label: string; message: string }> = {
  AWAITING_CONFIRMATION: {
    label: 'Esperando al mesero',
    message: 'Un mesero está por confirmar tu pedido en tu mesa.',
  },
  PENDING: {
    label: 'Enviado a cocina',
    message: 'Tu pedido está en la fila de la cocina.',
  },
  IN_PREPARATION: {
    label: 'En preparación',
    message: 'La cocina está preparando tus productos.',
  },
  READY: {
    label: 'Listo para servir',
    message: 'Tu pedido está listo para llevarte a la mesa.',
  },
  SERVED: {
    label: 'Servido',
    message: 'Tu pedido está en tu mesa. ¡Buen provecho!',
  },
  PAID: {
    label: 'Pagado',
    message: 'Tu pedido fue pagado. ¡Gracias por tu visita!',
  },
  CANCELLED: {
    label: 'Cancelado',
    message:
      'Tu pedido fue cancelado. Si necesitas ayuda, avisa a un mesero.',
  },
}

const STATUS_ICON = {
  AWAITING_CONFIRMATION: UserRound,
  PENDING: Send,
  IN_PREPARATION: ChefHat,
  READY: PackageCheck,
  SERVED: UtensilsCrossed,
  PAID: CheckCircle2,
  CANCELLED: XCircle,
} satisfies Record<OrderStatus, typeof UserRound>

const STATUS_ICON_COLOR: Record<OrderStatus, string> = {
  AWAITING_CONFIRMATION:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  PENDING: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  IN_PREPARATION:
    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  READY: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  SERVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
}

function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'PAID' || status === 'CANCELLED'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isOffersCategory(name: string): boolean {
  return normalizeName(name) === 'ofertas'
}

function lineQuantity(lines: CartLine[], productId: string): number {
  return lines.find((l) => l.productId === productId)?.quantity ?? 0
}

function buildPastSteps(
  order: Order,
): { status: OrderStatus; changedAt: string }[] {
  const history = order.statusHistory ?? []
  const all = history.some((s) => s.status === 'AWAITING_CONFIRMATION')
    ? history
    : [
        {
          status: 'AWAITING_CONFIRMATION' as OrderStatus,
          changedAt: order.createdAt,
        },
        ...history,
      ]
  return all.filter((s) => s.status !== order.status)
}

function CartaPage() {
  const { qrToken } = useParams<{ qrToken: string }>()
  const [lines, setLines] = useState<CartLine[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [cartOpen, setCartOpen] = useState(false)

  const initialStored = useMemo<StoredOrder | null>(
    () => (qrToken ? loadStoredOrder(qrToken) : null),
    [qrToken],
  )
  const [stored, setStored] = useState<StoredOrder | null>(initialStored)
  const [view, setView] = useState<'menu' | 'status'>(
    initialStored ? 'status' : 'menu',
  )

  const menuQuery = useQuery({
    queryKey: ['public-menu', qrToken],
    queryFn: () => getPublicMenuByToken(qrToken!),
    enabled: Boolean(qrToken),
    retry: false,
  })

  const statusQuery = useQuery({
    queryKey: ['qr-order-status', qrToken, stored?.customerToken],
    queryFn: () => getOrderStatusFromQr(qrToken!, stored!.customerToken),
    enabled: Boolean(qrToken && stored),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && isTerminalStatus(status) ? false : 5000
    },
  })

  useEffect(() => {
    if (!qrToken) return
    occupyTableByToken(qrToken).catch(() => {
      // Si falla (p. ej. red), la mesa igual se ocupará al confirmar el pedido.
    })
  }, [qrToken])

  const confirm = useMutation({
    mutationFn: (payload: {
      notes?: string
      items: { productId: string; quantity: number; notes?: string }[]
    }) => createOrderFromQr(qrToken!, payload),
    onSuccess: (order) => {
      if (!order.customerToken) return
      const next: StoredOrder = {
        orderId: order.id,
        customerToken: order.customerToken,
      }
      setStored(next)
      saveStoredOrder(qrToken!, next)
      setCartOpen(false)
      setLines([])
      setOrderNotes('')
      setView('status')
    },
  })

  const totals = useMemo(() => computeTotals(lines), [lines])

  const table = menuQuery.data?.table

  const offersCategory = useMemo(
    () =>
      (menuQuery.data?.categories ?? []).find((c) => isOffersCategory(c.name)),
    [menuQuery.data],
  )
  const regularCategories = useMemo(
    () =>
      (menuQuery.data?.categories ?? []).filter(
        (c) => !isOffersCategory(c.name),
      ),
    [menuQuery.data],
  )

  function addProduct(product: MenuProduct) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (!existing) {
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            unitPrice: product.price,
            quantity: 1,
          },
        ]
      }
      return prev.map((l) =>
        l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
      )
    })
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

  function handleConfirm() {
    if (lines.length === 0) return
    confirm.mutate({
      notes: orderNotes.trim() || undefined,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        notes: l.notes?.trim() || undefined,
      })),
    })
  }

  function handleBackToMenu() {
    setView('menu')
  }

  function handleCloseStored() {
    if (qrToken) clearStoredOrder(qrToken)
    setStored(null)
    setView('menu')
  }

  if (view === 'status' && stored) {
    return (
      <OrderStatusView
        query={statusQuery}
        onBackToMenu={handleBackToMenu}
        onClose={handleCloseStored}
      />
    )
  }

  if (menuQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Skeleton className="h-16 w-56" />
        <Skeleton className="h-8 w-32" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (menuQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">Mesa no encontrada</h1>
        <p className="text-muted-foreground">
          Verifica el código QR o pide ayuda a un mesero.
        </p>
        <p className="text-sm text-muted-foreground">
          {getApiErrorMessage(menuQuery.error)}
        </p>
      </div>
    )
  }

  const itemCount = totals.itemCount

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {stored && statusQuery.data && !isTerminalStatus(statusQuery.data.status) && (
        <ActiveOrderBanner
          order={statusQuery.data}
          onOpen={() => setView('status')}
        />
      )}

      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {menuQuery.data?.organizationName || 'Nuestra carta'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {menuQuery.data?.organizationName ? 'Nuestra carta' : 'Escanea el QR para pedir'}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <MapPin className="size-3" />
            Mesa {table?.number} · {table?.section}
          </Badge>
        </div>
      </header>

      <div className="space-y-8">
        {offersCategory && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Badge className="bg-amber-500 text-white">
                <ShoppingBag className="size-3" />
                Ofertas
              </Badge>
              <h2 className="text-xl font-semibold">{offersCategory.name}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {offersCategory.products.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  quantity={lineQuantity(lines, product.id)}
                  onAdd={() => addProduct(product)}
                />
              ))}
            </div>
          </section>
        )}

        {regularCategories.length === 0 && !offersCategory && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              La carta aún no tiene productos disponibles.
            </p>
          </div>
        )}

        {regularCategories.map((category) => (
          <section key={category.id}>
            <h2 className="mb-3 border-b pb-2 text-xl font-semibold">
              {category.name}
            </h2>
            <ul className="divide-y">
              {category.products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  quantity={lineQuantity(lines, product.id)}
                  onAdd={() => addProduct(product)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        <p>
          Arma tu pedido y un mesero lo confirmará en tu mesa antes de
          enviarlo a cocina.
        </p>
      </footer>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {itemCount} artículo{itemCount === 1 ? '' : 's'} en tu pedido
              </p>
              <p className="truncate text-sm text-muted-foreground tabular-nums">
                {formatCurrency(totals.total)}
              </p>
            </div>
            <Button size="lg" className="shrink-0" onClick={() => setCartOpen(true)}>
              <ReceiptText className="size-4" />
              Ver pedido
            </Button>
          </div>
        </div>
      )}

      <CartDialog
        open={cartOpen}
        onOpenChange={setCartOpen}
        lines={lines}
        totals={totals}
        orderNotes={orderNotes}
        isSubmitting={confirm.isPending}
        error={confirm.error}
        onQuantity={setQuantity}
        onLineNotes={setLineNotes}
        onRemoveLine={removeLine}
        onNotesChange={setOrderNotes}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

function ActiveOrderBanner({
  order,
  onOpen,
}: {
  order: Order
  onOpen: () => void
}) {
  const cfg = CUSTOMER_STATUS[order.status]
  const Icon = STATUS_ICON[order.status]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-6 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-left"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${STATUS_ICON_COLOR[order.status]}`}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{cfg.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          Pedido #{order.folio} · {formatCurrency(order.total)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function OrderStatusView({
  query,
  onBackToMenu,
  onClose,
}: {
  query: { data?: Order; isLoading: boolean; isError: boolean }
  onBackToMenu: () => void
  onClose: () => void
}) {
  const { data: order, isLoading, isError } = query

  if (isLoading && !order) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <XCircle className="size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">No encontramos tu pedido</h1>
        <p className="max-w-sm text-muted-foreground">
          Puede que ya haya sido cerrado. Pide ayuda a un mesero o vuelve a la
          carta.
        </p>
        <Button onClick={onClose} className="mt-2">
          Volver a la carta
        </Button>
      </div>
    )
  }

  const cfg = CUSTOMER_STATUS[order.status]
  const Icon = STATUS_ICON[order.status]
  const isDone = isTerminalStatus(order.status)
  const past = buildPastSteps(order)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <MapPin className="size-3" />
            Mesa {order.table?.number} · {order.table?.section}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Estado de tu pedido
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comanda #{order.folio}
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-6 text-center">
        <div
          className={`mx-auto flex size-16 items-center justify-center rounded-full ${STATUS_ICON_COLOR[order.status]}`}
        >
          <Icon className="size-8" />
        </div>
        <h2 className="mt-4 text-lg font-bold">{cfg.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{cfg.message}</p>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
          Avance del pedido
        </h3>
        <ol>
          {past.map((step, idx) => {
            const isLast = idx === past.length - 1
            return (
              <li key={`${step.status}-${idx}`} className="flex gap-3">
                <span className="relative flex flex-col items-center pt-1">
                  <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />
                  {!isLast && <span className="w-px flex-1 bg-border" />}
                </span>
                <div className={isLast ? '' : 'pb-5'}>
                  <p className="text-sm text-muted-foreground">
                    {CUSTOMER_STATUS[step.status].label}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {formatTime(step.changedAt)}
                  </p>
                </div>
              </li>
            )
          })}
          <li className="flex gap-3">
            <span className="relative flex flex-col items-center pt-1">
              <span className="size-2.5 shrink-0 rounded-full bg-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">{cfg.label}</p>
              <p className="text-xs text-muted-foreground/60">ahora</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Tu pedido
        </h3>
        <ul className="divide-y">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.quantity}× {item.productName}
                </p>
                {item.notes && (
                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                )}
              </div>
              <p className="text-sm tabular-nums">
                {formatCurrency(item.unitPrice * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 flex flex-col gap-2">
        {isDone ? (
          <Button className="w-full" size="lg" onClick={onClose}>
            Volver a la carta
          </Button>
        ) : (
          <>
            <Button className="w-full" size="lg" onClick={onBackToMenu}>
              <Plus className="size-4" />
              Agregar más pedidos
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Esta página se actualiza sola.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ProductTile({
  product,
  quantity,
  onAdd,
}: {
  product: MenuProduct
  quantity: number
  onAdd: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0">
        <p className="font-medium">{product.name}</p>
        {product.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {product.description}
          </p>
        )}
        <p className="mt-1.5 font-semibold tabular-nums">
          {formatCurrency(product.price)}
        </p>
      </div>
      <QuantityAddButton quantity={quantity} onAdd={onAdd} />
    </div>
  )
}

function ProductRow({
  product,
  quantity,
  onAdd,
}: {
  product: MenuProduct
  quantity: number
  onAdd: () => void
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-medium">{product.name}</p>
          <p className="shrink-0 font-semibold tabular-nums">
            {formatCurrency(product.price)}
          </p>
        </div>
        {product.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {product.description}
          </p>
        )}
      </div>
      <QuantityAddButton quantity={quantity} onAdd={onAdd} />
    </li>
  )
}

function QuantityAddButton({
  quantity,
  onAdd,
}: {
  quantity: number
  onAdd: () => void
}) {
  if (quantity === 0) {
    return (
      <Button variant="outline" size="sm" className="shrink-0" onClick={onAdd}>
        <Plus className="size-4" />
        Agregar
      </Button>
    )
  }
  return (
    <Button size="sm" className="shrink-0" onClick={onAdd}>
      <Plus className="size-4" />
      {quantity}
    </Button>
  )
}

function CartDialog({
  open,
  onOpenChange,
  lines,
  totals,
  orderNotes,
  isSubmitting,
  error,
  onQuantity,
  onLineNotes,
  onRemoveLine,
  onNotesChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lines: CartLine[]
  totals: ReturnType<typeof computeTotals>
  orderNotes: string
  isSubmitting: boolean
  error: Error | null
  onQuantity: (productId: string, quantity: number) => void
  onLineNotes: (productId: string, notes: string) => void
  onRemoveLine: (productId: string) => void
  onNotesChange: (value: string) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3 pr-10">
          <DialogTitle className="text-base">Tu pedido</DialogTitle>
          <DialogDescription>
            Revisa tu pedido antes de enviarlo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no agregaste productos.
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
                        onClick={() => onQuantity(line.productId, line.quantity - 1)}
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
                        onClick={() => onQuantity(line.productId, line.quantity + 1)}
                      >
                        <Plus className="size-3" />
                        <span className="sr-only">Más</span>
                      </Button>
                    </div>
                    <Input
                      value={line.notes ?? ''}
                      onChange={(e) => onLineNotes(line.productId, e.target.value)}
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
            placeholder="Notas del pedido (opcional)"
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
        </div>
        <DialogFooter className="border-t px-4 py-3">
          <Button
            className="w-full"
            size="lg"
            disabled={lines.length === 0 || isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Confirmar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CartaPage
