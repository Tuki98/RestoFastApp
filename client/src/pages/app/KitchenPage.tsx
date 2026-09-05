import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  Printer,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import {
  getApiErrorMessage,
  getOrders,
  updateOrderStatus,
} from '@/lib/api'
import type { Order } from '@/lib/api'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL } from '@/lib/orderStatus'
import { OrderStatusTimeline } from '@/components/OrderStatusTimeline'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { playChime } from '@/lib/notifications'
import { toastError } from '@/lib/toast'
import { printKitchenTicket, useOrganizationName } from '@/lib/print'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const REFRESH_MS = 10_000

const PENDING_WARN_MIN = 10
const PENDING_DANGER_MIN = 20
const COOKING_WARN_MIN = 15
const COOKING_DANGER_MIN = 30

type Urgency = 'normal' | 'warn' | 'danger'

function urgencyFor(order: Order): Urgency {
  const minutes = minutesAgo(order.createdAt)
  if (order.status === 'PENDING') {
    if (minutes >= PENDING_DANGER_MIN) return 'danger'
    if (minutes >= PENDING_WARN_MIN) return 'warn'
  }
  if (order.status === 'IN_PREPARATION') {
    if (minutes >= COOKING_DANGER_MIN) return 'danger'
    if (minutes >= COOKING_WARN_MIN) return 'warn'
  }
  return 'normal'
}

function minutesAgo(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60_000),
  )
}

function timeAgoLabel(iso: string): string {
  const minutes = minutesAgo(iso)
  if (minutes < 1) return 'recién llegada'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `hace ${hours} h ${rest} min` : `hace ${hours} h`
}

function orderTarget(order: Order): string {
  return order.orderType === 'DINE_IN' && order.table
    ? `Mesa ${order.table.number}`
    : 'Para llevar'
}

function KitchenPage() {
  const queryClient = useQueryClient()
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders(),
    refetchInterval: REFRESH_MS,
  })

  const pending = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === 'PENDING')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [orders.data],
  )
  const cooking = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === 'IN_PREPARATION')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [orders.data],
  )
  const ready = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === 'READY')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [orders.data],
  )

  const prevPendingIds = useRef('')
  useEffect(() => {
    const ids = pending.map((o) => o.id).sort().join(',')
    if (!prevPendingIds.current) {
      prevPendingIds.current = ids
      return
    }
    const prev = new Set(
      prevPendingIds.current ? prevPendingIds.current.split(',') : [],
    )
    const current = new Set(ids ? ids.split(',') : [])
    const hasNew = [...current].some((id) => !prev.has(id))
    prevPendingIds.current = ids
    if (hasNew) playChime()
  }, [pending])

  const start = useMutation({
    mutationFn: (id: string) => updateOrderStatus(id, 'IN_PREPARATION'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error) => toastError(error),
  })

  const finish = useMutation({
    mutationFn: (id: string) => updateOrderStatus(id, 'READY'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error) => toastError(error),
  })

  const busy = start.isPending || finish.isPending

  async function handleRefresh() {
    await queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  if (orders.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (orders.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">{getApiErrorMessage(orders.error)}</p>
        <Button variant="outline" onClick={handleRefresh}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cocina</h1>
          <p className="text-sm text-muted-foreground">
            Comandas pendientes y en preparación. Se actualiza automáticamente.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="size-4" />
          Refrescar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KitchenColumn
          title="Pendientes"
          icon={<Flame className="size-4 text-amber-600 dark:text-amber-400" />}
          count={pending.length}
          empty="No hay comandas nuevas."
          orders={pending}
          busy={busy}
          live
          renderAction={(order) => ({
            label: 'Comenzar',
            icon: <Flame className="size-4" />,
            onClick: () => start.mutate(order.id),
            disabled: busy,
          })}
        />
        <KitchenColumn
          title="En preparación"
          icon={<Clock className="size-4 text-sky-600 dark:text-sky-400" />}
          count={cooking.length}
          empty="No hay nada en preparación."
          orders={cooking}
          busy={busy}
          accent
          renderAction={(order) => ({
            label: 'Marcar lista',
            icon: <CheckCircle2 className="size-4" />,
            onClick: () => finish.mutate(order.id),
            disabled: busy,
          })}
        />
        <KitchenColumn
          title="Listas"
          icon={<CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
          count={ready.length}
          empty="Nada listo por servir."
          orders={ready}
          busy={busy}
          renderAction={() => null}
        />
      </div>
    </div>
  )
}

function KitchenColumn({
  title,
  icon,
  count,
  empty,
  orders,
  busy,
  accent = false,
  live = false,
  renderAction,
}: {
  title: string
  icon: React.ReactNode
  count: number
  empty: string
  orders: Order[]
  busy: boolean
  accent?: boolean
  live?: boolean
  renderAction: (
    order: Order,
  ) => { label: string; icon: React.ReactNode; onClick: () => void; disabled: boolean } | null
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <Badge variant="secondary" aria-live={live ? 'polite' : undefined}>
          {count}
        </Badge>
      </div>
      {orders.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              accent={accent}
              busy={busy}
              action={renderAction(order)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function KitchenOrderCard({
  order,
  accent,
  busy,
  action,
}: {
  order: Order
  accent: boolean
  busy: boolean
  action: {
    label: string
    icon: React.ReactNode
    onClick: () => void
    disabled: boolean
  } | null
}) {
  const badge = ORDER_STATUS_BADGE[order.status]
  const urgency = urgencyFor(order)
  const orgName = useOrganizationName()
  return (
    <Card
      className={cn(
        accent && 'border-amber-300 dark:border-amber-500',
        urgency === 'warn' && 'border-amber-400 dark:border-amber-500',
        urgency === 'danger' && 'border-red-400 dark:border-red-500',
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">#{order.folio}</CardTitle>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {order.orderType === 'DINE_IN' && order.table ? (
                <UtensilsCrossed className="size-3.5" />
              ) : (
                <ShoppingBag className="size-3.5" />
              )}
              {orderTarget(order)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Badge variant={badge.variant} className={badge.className}>
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="size-6"
                title="Imprimir comanda"
                aria-label={`Imprimir comanda #${order.folio}`}
                onClick={() => printKitchenTicket(order, orgName)}
              >
                <Printer className="size-3.5" />
              </Button>
            </div>
            <span
              className={cn(
                'flex items-center gap-1 text-xs',
                urgency === 'warn'
                  ? 'font-medium text-amber-600 dark:text-amber-400'
                  : urgency === 'danger'
                    ? 'font-semibold text-red-600 dark:text-red-400'
                    : 'text-muted-foreground',
              )}
            >
              <Clock className="size-3.5" />
              {timeAgoLabel(order.createdAt)}
            </span>
          </div>
        </div>
        {order.notes && (
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">
            «{order.notes}»
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <OrderStatusTimeline order={order} compact />
        <ul className="space-y-1.5">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {item.quantity}× {item.productName}
                </span>
                {item.notes && (
                  <span className="block text-xs text-muted-foreground">
                    · {item.notes}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        {action && (
          <Button
            className="w-full"
            variant={order.status === 'PENDING' ? 'default' : 'outline'}
            onClick={action.onClick}
            disabled={busy || action.disabled}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : action.icon}
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default KitchenPage
