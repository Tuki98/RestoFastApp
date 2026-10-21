import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  CreditCard,
  History,
  Loader2,
  Lock,
  Minus,
  Plus,
  Power,
  Smartphone,
  Wallet,
} from 'lucide-react'
import {
  closeCashSession,
  getApiErrorMessage,
  getCashSessions,
  getCurrentCashSession,
  openCashSession,
  type CashMethod,
  type CashSession,
} from '@/lib/api'
import { PAYMENT_METHOD_LABEL } from '@/lib/orderStatus'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

const METHOD_ICON: Record<CashMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  YAPE_PLIN: Smartphone,
}

function cashDifferenceLabel(diff: number): string {
  if (diff > 0) return `Sobre de ${formatCurrency(diff)}`
  if (diff < 0) return `Faltante de ${formatCurrency(Math.abs(diff))}`
  return 'Cuadre exacto'
}

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]

function CajaPage() {
  const queryClient = useQueryClient()
  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null)
  const [closedSession, setClosedSession] = useState<CashSession | null>(null)

  const currentQuery = useQuery({
    queryKey: ['cash-sessions', 'current'],
    queryFn: getCurrentCashSession,
    refetchInterval: 30_000,
  })

  const historyQuery = useQuery({
    queryKey: ['cash-sessions'],
    queryFn: getCashSessions,
    refetchInterval: 30_000,
  })

  const openCash = useMutation({
    mutationFn: (openingBalance: number) => openCashSession(openingBalance),
    onSuccess: async () => {
      setClosedSession(null)
      toast.success('Caja abierta')
      await queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
    },
    onError: (error) => toastError(error),
  })

  const closeCash = useMutation({
    mutationFn: ({ id, countedCash }: { id: string; countedCash?: number }) =>
      closeCashSession(id, countedCash),
    onSuccess: async (session) => {
      setClosedSession(session)
      setCloseTarget(null)
      toast.success('Caja cerrada')
      await queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
    },
    onError: (error) => toastError(error),
  })

  if (currentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  if (currentQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">
          {getApiErrorMessage(currentQuery.error)}
        </p>
        <Button variant="outline" onClick={() => currentQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  const current = currentQuery.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="text-sm text-muted-foreground">
            Abre la caja con tu caja chica y cierra el turno con el conteo de
            ingresos por método de pago.
          </p>
        </div>
      </div>

      {closedSession && (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
              Caja cerrada
            </CardTitle>
            <CardDescription>
              La caja del {formatDateTime(closedSession.openedAt)} se cerró con
              un total de {formatCurrency(closedSession.summary.totalIncome)}.
              Contaste{' '}
              {closedSession.summary.countedCash !== undefined
                ? formatCurrency(closedSession.summary.countedCash)
                : formatCurrency(closedSession.summary.expectedCash)}{' '}
              en efectivo (
              {closedSession.summary.cashDifference !== undefined
                ? cashDifferenceLabel(closedSession.summary.cashDifference)
                : `esperado ${formatCurrency(closedSession.summary.expectedCash)}`}
              ).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {current ? (
        <ActiveCashCard session={current} onClose={() => setCloseTarget(current)} />
      ) : (
        <OpenCashCard
          isSubmitting={openCash.isPending}
          error={openCash.error}
          onOpen={(openingBalance) => openCash.mutate(openingBalance)}
        />
      )}

      <CashHistory
        sessions={historyQuery.data ?? []}
        currentId={current?.id}
      />

      <CloseCashDialog
        session={closeTarget}
        isSubmitting={closeCash.isPending}
        error={closeCash.error}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null)
        }}
        onConfirm={(countedCash) =>
          closeCash.mutate({ id: closeTarget!.id, countedCash })
        }
      />
    </div>
  )
}

function OpenCashCard({
  isSubmitting,
  error,
  onOpen,
}: {
  isSubmitting: boolean
  error: Error | null
  onOpen: (openingBalance: number) => void
}) {
  const [amount, setAmount] = useState('100')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = Math.round(parseFloat(amount.replace(',', '.')) * 100) / 100
    if (Number.isFinite(value) && value >= 0) {
      onOpen(value)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          Abrir caja
        </CardTitle>
        <CardDescription>
          Registra la caja chica (el efectivo con el que inicia la caja) para
          comenzar el turno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:flex-1">
            <Label htmlFor="opening-balance">Caja chica (efectivo inicial)</Label>
            <Input
              id="opening-balance"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            <Lock className="size-4" />
            Abrir caja
          </Button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ActiveCashCard({
  session,
  onClose,
}: {
  session: CashSession
  onClose: () => void
}) {
  const summary = session.summary

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CircleDollarSign className="size-5 text-primary" />
            Caja en curso
          </CardTitle>
          <CardDescription>
            Abierta el {formatDateTime(session.openedAt)} por{' '}
            {session.openedBy.name}
          </CardDescription>
        </div>
        <Badge>En curso</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Caja chica
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCurrency(session.openingBalance)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Ventas del turno
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {summary.ordersCount}
            </p>
          </div>
          <div className="rounded-lg border bg-primary/5 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Efectivo esperado
            </p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {formatCurrency(summary.expectedCash)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {summary.incomeByMethod.map((entry) => {
            const Icon = METHOD_ICON[entry.method]
            return (
              <div
                key={entry.method}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {PAYMENT_METHOD_LABEL[entry.method]}
                </span>
                <span className="text-sm font-semibold">
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            )
          })}
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-semibold">Total ingresos</span>
            <span className="text-base font-bold">
              {formatCurrency(summary.totalIncome)}
            </span>
          </div>
        </div>

        <Button variant="destructive" className="w-full" onClick={onClose}>
          <Power className="size-4" />
          Cerrar caja
        </Button>
      </CardContent>
    </Card>
  )
}

function CloseCashDialog({
  session,
  isSubmitting,
  error,
  onOpenChange,
  onConfirm,
}: {
  session: CashSession | null
  isSubmitting: boolean
  error: Error | null
  onOpenChange: (open: boolean) => void
  onConfirm: (countedCash: number) => void
}) {
  const [counted, setCounted] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    setCounted('')
    setCounts({})
  }, [session?.id])

  const expectedCash = session?.summary.expectedCash ?? 0
  const parsed =
    Math.round(parseFloat(counted.replace(',', '.')) * 100) / 100
  const valid = Number.isFinite(parsed) && parsed >= 0
  const diff = valid ? Math.round((parsed - expectedCash) * 100) / 100 : null

  const denomTotal = Math.round(
    DENOMINATIONS.reduce(
      (sum, denom) => sum + denom * (counts[String(denom)] ?? 0),
      0,
    ) * 100,
  ) / 100

  function bump(denom: number, delta: number) {
    const key = String(denom)
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + delta),
    }))
    setCounted((prev) => {
      const current =
        Math.round(parseFloat(prev.replace(',', '.')) * 100) / 100
      const base = Number.isFinite(current) ? current : 0
      const next = Math.round(Math.max(0, base + denom * delta) * 100) / 100
      return String(next)
    })
  }

  return (
    <Dialog
      open={Boolean(session)}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Cuenta el efectivo del cajón y registra el total. La diferencia se
            calcula contra el efectivo esperado. Esta acción no se puede
            deshacer.
          </DialogDescription>
        </DialogHeader>

        {session && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="counted-cash">Efectivo contado</Label>
              <Input
                id="counted-cash"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder={expectedCash.toFixed(2)}
              />
            </div>

            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                Conteo rápido por denominaciones
              </p>
              <div className="space-y-1">
                {DENOMINATIONS.map((denom) => {
                  const qty = counts[String(denom)] ?? 0
                  return (
                    <div
                      key={denom}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="w-14 font-medium tabular-nums">
                        {formatCurrency(denom)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          onClick={() => bump(denom, -1)}
                          disabled={qty === 0}
                        >
                          <Minus className="size-3" />
                          <span className="sr-only">
                            Quitar una unidad de {formatCurrency(denom)}
                          </span>
                        </Button>
                        <span className="w-5 text-center tabular-nums">
                          {qty}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          onClick={() => bump(denom, 1)}
                        >
                          <Plus className="size-3" />
                          <span className="sr-only">
                            Agregar una unidad de {formatCurrency(denom)}
                          </span>
                        </Button>
                      </div>
                      <span className="w-20 text-right text-muted-foreground tabular-nums">
                        {formatCurrency(denom * qty)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-medium">
                <span>Suma del conteo</span>
                <span className="tabular-nums">{formatCurrency(denomTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Los controles suman y restan del efectivo contado.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Efectivo esperado (caja chica + efectivo)
                </span>
                <span className="font-semibold">
                  {formatCurrency(expectedCash)}
                </span>
              </div>
              {diff !== null && (
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground">Diferencia</span>
                  <span
                    className={
                      diff === 0
                        ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                        : diff > 0
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'font-semibold text-red-600 dark:text-red-400'
                    }
                  >
                    {cashDifferenceLabel(diff)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {session.summary.incomeByMethod.map((entry) => (
                <div
                  key={entry.method}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {PAYMENT_METHOD_LABEL[entry.method]}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(entry.amount)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="font-medium">Total ingresos</span>
                <span className="font-semibold">
                  {formatCurrency(session.summary.totalIncome)}
                </span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="shrink-0 text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(valid ? parsed : expectedCash)}
            disabled={isSubmitting || !valid}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Cerrar caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CashHistory({
  sessions,
  currentId,
}: {
  sessions: CashSession[]
  currentId?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5 text-primary" />
          Historial de caja
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aún no hay sesiones de caja.
          </p>
        ) : (
          <div className="divide-y">
            {sessions.map((session) => {
              const isCurrent = session.id === currentId
              return (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {formatDateTime(session.openedAt)}
                      {isCurrent && <Badge>En curso</Badge>}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {session.closedAt
                        ? `Cierre ${formatDateTime(session.closedAt)}`
                        : 'Caja aún abierta'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatCurrency(session.summary.totalIncome)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Efectivo esperado{' '}
                      {formatCurrency(session.summary.expectedCash)}
                      {session.summary.cashDifference !== undefined && (
                        <span className="ml-1">
                          · {cashDifferenceLabel(session.summary.cashDifference)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CajaPage
