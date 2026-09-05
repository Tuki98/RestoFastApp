import type { OrderStatus, OrderType, PaymentMethod } from '@/lib/api'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  IN_PREPARATION: 'En preparación',
  READY: 'Lista',
  SERVED: 'Servida',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
  AWAITING_CONFIRMATION: 'Por atender',
}

export const ORDER_STATUS_BADGE: Record<
  OrderStatus,
  { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
> = {
  PENDING: { variant: 'secondary' },
  IN_PREPARATION: { variant: 'default' },
  READY: { variant: 'outline', className: 'text-amber-700 dark:text-amber-400' },
  SERVED: { variant: 'outline', className: 'text-sky-700 dark:text-sky-400' },
  PAID: { variant: 'outline', className: 'text-emerald-700 dark:text-emerald-400' },
  CANCELLED: { variant: 'destructive' },
  AWAITING_CONFIRMATION: {
    variant: 'destructive',
    className: 'bg-amber-500 text-white',
  },
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'En mesa',
  TAKEOUT: 'Para llevar',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  YAPE_PLIN: 'Yape/Plin',
}

export const OPEN_STATUSES: OrderStatus[] = [
  'PENDING',
  'IN_PREPARATION',
  'READY',
  'SERVED',
  'AWAITING_CONFIRMATION',
]
