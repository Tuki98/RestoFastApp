import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileDown,
  Receipt,
  RefreshCw,
  Timer,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import {
  downloadReportsExcel,
  EXPENSE_CATEGORY_LABEL,
  getApiErrorMessage,
  getReportCash,
  getReportInventory,
  getReportSalesTrend,
  getReportService,
  getReportSummary,
  getReportTopProducts,
  type CashReport,
  type InventoryReport,
  type PaymentMethod,
  type SalesTrendReport,
  type ServiceReport,
  type SummaryReport,
  type TopProductsReport,
} from '@/lib/api'
import { PAYMENT_METHOD_LABEL, ORDER_TYPE_LABEL } from '@/lib/orderStatus'
import { formatCurrency, formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]

const METHOD_COLORS: Record<string, string> = {
  CASH: '#10b981',
  CARD: '#3b82f6',
  YAPE_PLIN: '#8b5cf6',
}

const PIE_COLORS = [
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#ec4899',
  '#84cc16',
  '#06b6d4',
]

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'productos', label: 'Productos' },
  { id: 'servicio', label: 'Servicio' },
  { id: 'caja', label: 'Caja' },
  { id: 'inventario', label: 'Inventario' },
] as const

type TabId = (typeof TABS)[number]['id']
type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'custom', label: 'Personalizado' },
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Día operativo: de 11:30 a. m. a 11:29 a. m. del día siguiente.
const BUSINESS_DAY_START_HOUR = 11
const BUSINESS_DAY_START_MINUTE = 30

function businessDayString(d: Date): string {
  const x = new Date(d)
  if (
    x.getHours() < BUSINESS_DAY_START_HOUR ||
    (x.getHours() === BUSINESS_DAY_START_HOUR &&
      x.getMinutes() < BUSINESS_DAY_START_MINUTE)
  ) {
    x.setDate(x.getDate() - 1)
  }
  return toDateString(x)
}

function rangeFor(key: RangeKey): { from: string; to: string } {
  const today = businessDayString(new Date())
  // Mediodía del día operativo actual: evita problemas de zona horaria.
  const base = new Date(`${today}T12:00:00`)
  switch (key) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const day = new Date(base)
      day.setDate(day.getDate() - 1)
      const from = toDateString(day)
      return { from, to: from }
    }
    case '7d': {
      const from = new Date(base)
      from.setDate(from.getDate() - 6)
      return { from: toDateString(from), to: today }
    }
    case 'month': {
      const from = new Date(base.getFullYear(), base.getMonth(), 1)
      const fromStr = toDateString(from)
      return { from: fromStr > today ? today : fromStr, to: today }
    }
    default: {
      const from = new Date(base)
      from.setDate(from.getDate() - 29)
      return { from: toDateString(from), to: today }
    }
  }
}

function formatPeriod(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return new Intl.DateTimeFormat('es-PE', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${period}-01T12:00:00`))
  }
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${period}T12:00:00`))
}

function compactMoney(value: number): string {
  return 'S/ ' + new Intl.NumberFormat('es-PE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function tooltipMoney(value: unknown, name: unknown): [string, string] {
  const label = String(name)
  if (label === 'Pedidos' || label === 'Unidades') {
    return [formatNumber(Number(value), 0), label]
  }
  return [formatCurrency(Number(value)), label]
}

function ReportsPage() {
  const [tab, setTab] = useState<TabId>('resumen')
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const range = useMemo(() => {
    if (rangeKey === 'custom') return { from: customFrom, to: customTo }
    return rangeFor(rangeKey)
  }, [rangeKey, customFrom, customTo])

  const params = useMemo(
    () => ({ from: range.from, to: range.to }),
    [range.from, range.to],
  )
  const enabled = Boolean(params.from && params.to)

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', params],
    queryFn: () => getReportSummary(params),
    enabled,
  })

  const trendQuery = useQuery({
    queryKey: ['reports', 'trend', params, granularity],
    queryFn: () => getReportSalesTrend({ ...params, granularity }),
    enabled,
  })

  const productsQuery = useQuery({
    queryKey: ['reports', 'products', params],
    queryFn: () => getReportTopProducts({ ...params, limit: 50 }),
    enabled,
  })

  const serviceQuery = useQuery({
    queryKey: ['reports', 'service', params],
    queryFn: () => getReportService(params),
    enabled,
  })

  const cashQuery = useQuery({
    queryKey: ['reports', 'cash', params],
    queryFn: () => getReportCash(params),
    enabled,
  })

  const inventoryQuery = useQuery({
    queryKey: ['reports', 'inventory', params],
    queryFn: () => getReportInventory(params),
    enabled,
  })

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadReportsExcel(params)
    } catch (error) {
      setExportError(getApiErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Ventas, productos, servicio, caja e inventario.
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <FileDown className="size-4" />
          )}
          Exportar Excel
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Período
            </p>
            <div className="flex flex-wrap gap-1.5">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  variant={rangeKey === option.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRangeKey(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {rangeKey === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 w-40"
                />
              </div>
              <span className="text-muted-foreground">a</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          )}
          <p className="w-full text-xs text-muted-foreground">
            Día operativo: de 11:30 a. m. a 11:29 a. m. del día siguiente.
          </p>
        </CardContent>
      </Card>

      {exportError && (
        <p className="text-sm text-destructive">{exportError}</p>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            size="sm"
            className={cn(tab === t.id && 'bg-accent text-accent-foreground')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {!enabled ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecciona la fecha de inicio y fin para ver el reporte.
          </CardContent>
        </Card>
      ) : (
        <>
          {tab === 'resumen' && (
            <SummaryTab
              query={summaryQuery}
              onRetry={() => summaryQuery.refetch()}
            />
          )}
          {tab === 'ventas' && (
            <TrendTab
              query={trendQuery}
              granularity={granularity}
              onGranularity={setGranularity}
              onRetry={() => trendQuery.refetch()}
            />
          )}
          {tab === 'productos' && (
            <ProductsTab
              query={productsQuery}
              onRetry={() => productsQuery.refetch()}
            />
          )}
          {tab === 'servicio' && (
            <ServiceTab
              query={serviceQuery}
              onRetry={() => serviceQuery.refetch()}
            />
          )}
          {tab === 'caja' && (
            <CashTab query={cashQuery} onRetry={() => cashQuery.refetch()} />
          )}
          {tab === 'inventario' && (
            <InventoryTab
              query={inventoryQuery}
              onRetry={() => inventoryQuery.refetch()}
            />
          )}
        </>
      )}
    </div>
  )
}

function QueryState({
  loading,
  hasData,
  error,
  onRetry,
}: {
  loading: boolean
  hasData: boolean
  error: Error | null
  onRetry: () => void
}) {
  if (loading || (!error && !hasData)) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground">{getApiErrorMessage(error)}</p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }
  return null
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  icon: typeof Receipt
  accent?: boolean
}) {
  return (
    <Card className={cn(accent && 'border-primary/30 bg-primary/5')}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {label}
          </p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums">
          {value}
        </p>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ChartEmpty({ message = 'Sin datos en el período.' }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

// ---------- Resumen ----------

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-muted-foreground">Sin período anterior</span>
  }
  if (delta > 0) {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white">
        <TrendingUp className="size-3" />
        +{delta}%
      </Badge>
    )
  }
  if (delta < 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <TrendingDown className="size-3" />
        {delta}%
      </Badge>
    )
  }
  return <Badge variant="secondary">0%</Badge>
}

function SummaryTab({
  query,
  onRetry,
}: {
  query: { data?: SummaryReport; isLoading: boolean; isError: boolean; error: Error | null }
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const summary = query.data!

  const ordersDelta =
    summary.prevOrdersCount > 0
      ? Math.round(
          ((summary.ordersCount - summary.prevOrdersCount) /
            summary.prevOrdersCount) *
            100,
        )
      : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ingresos"
          value={formatCurrency(summary.revenue)}
          icon={Receipt}
          sub={<DeltaBadge delta={summary.revenueDeltaPct} />}
          accent
        />
        <KpiCard
          label="Pedidos"
          value={String(summary.ordersCount)}
          icon={UtensilsCrossed}
          sub={
            <>
              <span className="text-muted-foreground">
                {summary.prevOrdersCount} en el período anterior
              </span>{' '}
              <DeltaBadge delta={ordersDelta} />
            </>
          }
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCurrency(summary.avgTicket)}
          icon={Timer}
          sub={<DeltaBadge delta={summary.avgTicketDeltaPct} />}
        />
        <KpiCard
          label="Cancelados"
          value={String(summary.cancelledCount)}
          icon={AlertTriangle}
          sub={formatCurrency(summary.cancelledAmount)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ventas por método de pago">
          {summary.byPaymentMethod.every((m) => m.amount === 0) ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.byPaymentMethod}
                    dataKey="amount"
                    nameKey="method"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    label={(entry) =>
                      PAYMENT_METHOD_LABEL[String(entry.method) as PaymentMethod] ??
                      String(entry.method)
                    }
                  >
                    {summary.byPaymentMethod.map((entry) => (
                      <Cell
                        key={entry.method}
                        fill={METHOD_COLORS[entry.method] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), 'Ingresos']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Tipo de pedido">
          {summary.byOrderType.every((t) => t.amount === 0) ? (
            <ChartEmpty />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Participación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byOrderType.map((entry) => (
                    <TableRow key={entry.type}>
                      <TableCell className="font-medium">
                        {ORDER_TYPE_LABEL[entry.type]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {summary.revenue > 0
                          ? formatNumber((entry.amount / summary.revenue) * 100, 1) + '%'
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas por turno</CardTitle>
          <CardDescription>
            Cada apertura de caja del período, con sus ventas por método de pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.shifts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay turnos de caja en el período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turno</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Tarjeta</TableHead>
                    <TableHead className="text-right">Yape/Plin</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Ingreso neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.shifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell>
                        <div className="font-medium">
                          {shift.isUnassigned
                            ? 'Sin turno asignado'
                            : formatDateTime(shift.openedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shift.isUnassigned
                            ? 'Cobros históricos sin caja asociada'
                            : shift.isOpen
                              ? 'Abierta'
                              : `Cierre: ${formatDateTime(shift.closedAt!)}`}
                          {!shift.isUnassigned && shift.openedBy?.name
                            ? ` · Abrió: ${shift.openedBy.name}`
                            : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {shift.ordersCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(shift.cash)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {shift.cashCount} venta{shift.cashCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(shift.card)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {shift.cardCount} venta{shift.cardCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(shift.yape)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {shift.yapeCount} venta{shift.yapeCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(shift.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {formatCurrency(shift.expenses)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(shift.netIncome)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Ventas ----------

function TrendTab({
  query,
  granularity,
  onGranularity,
  onRetry,
}: {
  query: { data?: SalesTrendReport; isLoading: boolean; isError: boolean; error: Error | null }
  granularity: 'day' | 'week' | 'month'
  onGranularity: (g: 'day' | 'week' | 'month') => void
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const trend = query.data!

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={granularity} onValueChange={(v) => onGranularity(v as 'day' | 'week' | 'month')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Por día</SelectItem>
            <SelectItem value="week">Por semana</SelectItem>
            <SelectItem value="month">Por mes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ChartCard
        title="Evolución de ventas"
        description="Ingresos y número de pedidos en el período"
      >
        {trend.series.length === 0 ? (
          <ChartEmpty />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickFormatter={formatPeriod}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="revenue"
                  tickFormatter={compactMoney}
                  width={54}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  allowDecimals={false}
                  width={36}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={tooltipMoney}
                  labelFormatter={(label) => formatPeriod(String(label))}
                />
                <Legend />
                <Area
                  yAxisId="revenue"
                  dataKey="revenue"
                  name="Ingresos"
                  type="monotone"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Bar
                  yAxisId="orders"
                  dataKey="orders"
                  name="Pedidos"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ventas por día de la semana">
          {trend.byDayOfWeek.every((d) => d.revenue === 0) ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.byDayOfWeek}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day) => DAY_NAMES[Number(day) - 1]}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickFormatter={compactMoney} width={54} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={tooltipMoney}
                    labelFormatter={(day) => DAY_NAMES[Number(day) - 1]}
                  />
                  <Bar dataKey="revenue" name="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Ventas por hora del día">
          {trend.byHour.every((h) => h.revenue === 0) ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.byHour}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(hour) => `${hour}:00`}
                    tick={{ fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis tickFormatter={compactMoney} width={54} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={tooltipMoney}
                    labelFormatter={(hour) => `${hour}:00`}
                  />
                  <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ---------- Productos ----------

function ProductsTab({
  query,
  onRetry,
}: {
  query: { data?: TopProductsReport; isLoading: boolean; isError: boolean; error: Error | null }
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const products = query.data!

  const hasSales = products.top.length > 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Platillos más vendidos"
          description="Por ingresos en el período"
        >
          {!hasSales ? (
            <ChartEmpty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={products.top.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 8, right: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={compactMoney}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="productName"
                    width={150}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={tooltipMoney} />
                  <Bar dataKey="revenue" name="Ingresos" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Ventas por categoría">
          {!hasSales || products.byCategory.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={products.byCategory}
                    dataKey="revenue"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    label={(entry) => String(entry.name)}
                  >
                    {products.byCategory.map((entry, index) => (
                      <Cell
                        key={entry.category}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle por platillo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platillo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.top.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Sin ventas en el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.top.map((entry, index) => (
                    <TableRow key={entry.productId ?? entry.productName}>
                      <TableCell className="font-medium">
                        <span className="mr-2 text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        {entry.productName}
                      </TableCell>
                      <TableCell>{entry.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Servicio ----------

function ServiceTab({
  query,
  onRetry,
}: {
  query: { data?: ServiceReport; isLoading: boolean; isError: boolean; error: Error | null }
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const service = query.data!
  const st = service.serviceTimes

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Cocina (promedio)"
          value={st.avgKitchenMs === null ? '—' : formatDuration(st.avgKitchenMs)}
          icon={Clock3}
          sub="De PENDING a READY"
        />
        <KpiCard
          label="Hasta servido (promedio)"
          value={st.avgTotalMs === null ? '—' : formatDuration(st.avgTotalMs)}
          icon={Timer}
          sub="Desde la creación"
        />
        <KpiCard
          label="Ocupación de mesas"
          value={`${service.tables.utilization}%`}
          icon={UtensilsCrossed}
          sub={`${service.tables.occupied} de ${service.tables.total} mesas`}
        />
        <KpiCard
          label="Permanencia promedio"
          value={
            service.tables.avgDineInDurationMs === null
              ? '—'
              : formatDuration(service.tables.avgDineInDurationMs)
          }
          icon={Wallet}
          sub={`${service.tables.avgOrdersPerTable} pedidos por mesa`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ventas por mesero">
          {service.byWaiter.length === 0 ? (
            <ChartEmpty message="Sin pedidos en el período." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mesero</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {service.byWaiter.map((entry) => (
                    <TableRow key={entry.userId ?? entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Ranking de mesas">
          {service.tables.ranking.length === 0 ? (
            <ChartEmpty message="Sin pedidos en el período." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mesa</TableHead>
                    <TableHead>Sección</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {service.tables.ranking.map((entry) => (
                    <TableRow key={entry.number}>
                      <TableCell className="font-medium">
                        Mesa {entry.number}
                      </TableCell>
                      <TableCell>{entry.section}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ---------- Caja ----------

function CashTab({
  query,
  onRetry,
}: {
  query: { data?: CashReport; isLoading: boolean; isError: boolean; error: Error | null }
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const cash = query.data!

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Ingresos del período"
          value={formatCurrency(cash.totals.income)}
          icon={Wallet}
          sub={`${cash.totals.sessionsCount} cierre(s) de caja`}
        />
        <KpiCard
          label="Gastos del período"
          value={formatCurrency(cash.totals.expenses)}
          icon={Receipt}
          sub={`${cash.totals.expensesCount} gasto(s) registrados`}
        />
        <KpiCard
          label="Resultado neto"
          value={formatCurrency(cash.totals.netResult)}
          icon={TrendingUp}
          accent
          sub="Ingresos − gastos"
        />
      </div>

      {cash.expensesByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos por categoría</CardTitle>
            <CardDescription>
              Gastos registrados en el negocio dentro del período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cash.expensesByCategory.map((entry) => (
                    <TableRow key={entry.category}>
                      <TableCell className="font-medium">
                        {EXPENSE_CATEGORY_LABEL[entry.category]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-primary" />
            Cierres de caja en el período
          </CardTitle>
          <CardDescription>
            El efectivo esperado es la caja chica más el efectivo cobrado menos
            los gastos del turno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cash.sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay cierres de caja en el período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Apertura</TableHead>
                    <TableHead>Cierre</TableHead>
                    <TableHead>Abrió</TableHead>
                    <TableHead className="text-right">Caja chica</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Tarjeta</TableHead>
                    <TableHead className="text-right">Yape/Plin</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Resultado neto</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Efectivo esperado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cash.sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>{formatDateTime(session.openedAt)}</TableCell>
                      <TableCell>
                        {session.closedAt ? formatDateTime(session.closedAt) : '—'}
                      </TableCell>
                      <TableCell>{session.openedBy.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(session.openingBalance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(session.cash)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {session.cashCount} venta{session.cashCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(session.card)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {session.cardCount} venta{session.cardCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(session.yape)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {session.yapeCount} venta{session.yapeCount === 1 ? '' : 's'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(session.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {session.expenses > 0
                          ? `− ${formatCurrency(session.expenses)}`
                          : formatCurrency(0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(session.netResult)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {session.ordersCount}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(session.expectedCash)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Inventario ----------

function InventoryTab({
  query,
  onRetry,
}: {
  query: { data?: InventoryReport; isLoading: boolean; isError: boolean; error: Error | null }
  onRetry: () => void
}) {
  const state = QueryState({ loading: query.isLoading, hasData: Boolean(query.data), error: query.error, onRetry })
  if (state) return state
  const inventory = query.data!

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Consumo de insumos en el período">
          {inventory.consumption.length === 0 ? (
            <ChartEmpty message="Sin movimientos de salida en el período." />
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Unidad</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.consumption.map((entry) => (
                    <TableRow key={entry.ingredientId}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="text-right">{entry.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Stock bajo el mínimo">
          {inventory.lowStock.length === 0 ? (
            <ChartEmpty message="Ningún insumo por debajo del mínimo." />
          ) : (
            <div className="space-y-2">
              {inventory.lowStock.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock {formatNumber(entry.stock)} {entry.unit}
                    </p>
                  </div>
                  <Badge variant="destructive">Mín. {formatNumber(entry.minStock)}</Badge>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Lotes por vencer (30 días)">
          {inventory.expiring.soon.length === 0 ? (
            <ChartEmpty message="Ningún lote por vencer pronto." />
          ) : (
            <div className="space-y-2">
              {inventory.expiring.soon.map((entry, index) => (
                <div
                  key={`${entry.ingredientId}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.ingredientName}</p>
                    <p className="text-xs text-muted-foreground">
                      Restante {formatNumber(entry.remaining)} {entry.unit}
                    </p>
                  </div>
                  {entry.expiresAt && (
                    <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                      Vence {formatDateOnly(entry.expiresAt)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Lotes vencidos">
          {inventory.expiring.expired.length === 0 ? (
            <ChartEmpty message="Ningún lote vencido." />
          ) : (
            <div className="space-y-2">
              {inventory.expiring.expired.map((entry, index) => (
                <div
                  key={`${entry.ingredientId}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.ingredientName}</p>
                    <p className="text-xs text-muted-foreground">
                      Restante {formatNumber(entry.remaining)} {entry.unit}
                    </p>
                  </div>
                  {entry.expiresAt && (
                    <Badge variant="destructive">Venció {formatDateOnly(entry.expiresAt)}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function formatDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

export default ReportsPage
