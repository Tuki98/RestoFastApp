import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Martini,
  ReceiptText,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import {
  getCurrentCashSession,
  getHealth,
  getReportSummary,
  isOperator,
} from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function HomePage() {
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const clear = useAuthStore((state) => state.clear)
  const navigate = useNavigate()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  const isDbOk = health.data?.database === 'ok'

  function handleLogout() {
    clear()
    navigate('/login', { replace: true })
  }

  const permissions = user?.permissions ?? []
  const canReports = permissions.includes('reports:view')
  const canCash = permissions.includes('caja:manage')

  const quickLinks = [
    { to: '/app/pos', label: 'POS · Comandas', permission: 'orders:create', icon: ReceiptText },
    { to: '/app/cocina', label: 'Cocina', permission: 'kitchen:view', icon: ChefHat },
    { to: '/app/caja', label: 'Caja', permission: 'caja:manage', icon: Wallet },
    { to: '/app/tables', label: 'Mesas', permission: 'tables:manage', icon: UtensilsCrossed },
    { to: '/app/menu', label: 'Menú', permission: 'menu:manage', icon: ClipboardList },
    { to: '/app/reports', label: 'Reportes', permission: 'reports:view', icon: CircleDollarSign },
  ].filter((item) => permissions.includes(item.permission))

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/50 p-6">
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-amber-500/10 blur-3xl" />

      <ThemeToggle className="absolute top-6 right-6 bg-background/70 backdrop-blur" />

      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
          <Martini className="size-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          RestobarService
        </h1>
        <p className="mt-2 text-muted-foreground">
          Sistema de gestión para tu restaurante
        </p>
      </div>

      <Card className="w-full max-w-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Estado del sistema</CardTitle>
          <CardDescription>Conectividad API y base de datos</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">API</span>
            <span
              className={
                health.isSuccess
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }
            >
              {health.isLoading
                ? 'Verificando…'
                : health.isSuccess
                  ? 'Conectada'
                  : 'Sin conexión'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Base de datos</span>
            <span
              className={
                isDbOk
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }
            >
              {health.isLoading
                ? 'Verificando…'
                : isDbOk
                  ? 'OK'
                  : 'Error'}
            </span>
          </div>
        </CardContent>
      </Card>

      {token && user ? (
        <div className="mt-8 w-full max-w-3xl space-y-6">
          <p className="text-center text-sm text-muted-foreground">
            Sesión iniciada como <span className="font-medium">{user.name}</span>{' '}
            ({user.role.label})
          </p>

          {!isOperator(user) && (
            <TodaySummary canReports={canReports} canCash={canCash} />
          )}

          {quickLinks.length > 0 && (
            <div>
              <h2 className="mb-3 text-center text-sm font-semibold text-muted-foreground">
                Acceso rápido
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {quickLinks.map((item) => (
                  <Button
                    key={item.to}
                    asChild
                    variant="outline"
                    className="h-20 flex-col gap-2 bg-background/70 backdrop-blur"
                  >
                    <Link to={item.to}>
                      <item.icon className="size-5" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link to={isOperator(user) ? '/admin' : '/app'}>Ir al panel</Link>
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex gap-3">
          <Button asChild variant="outline">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild>
            <Link to="/app">Ir al panel</Link>
          </Button>
        </div>
      )}
    </main>
  )
}

function TodaySummary({
  canReports,
  canCash,
}: {
  canReports: boolean
  canCash: boolean
}) {
  const today = toDateString(new Date())

  const summaryQuery = useQuery({
    queryKey: ['home-summary', today],
    queryFn: () => getReportSummary({ from: today, to: today }),
    enabled: canReports,
  })

  const cashQuery = useQuery({
    queryKey: ['cash-sessions', 'current'],
    queryFn: getCurrentCashSession,
    enabled: canCash,
  })

  const data = summaryQuery.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de hoy</CardTitle>
        <CardDescription>Ventas y actividad del día</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HomeStat
          label="Ventas"
          loading={summaryQuery.isLoading}
          value={data ? formatCurrency(data.revenue) : undefined}
        />
        <HomeStat
          label="Comandas"
          loading={summaryQuery.isLoading}
          value={data ? String(data.ordersCount) : undefined}
        />
        <HomeStat
          label="Ticket promedio"
          loading={summaryQuery.isLoading}
          value={data ? formatCurrency(data.avgTicket) : undefined}
        />
        <HomeStat
          label="Caja"
          loading={cashQuery.isLoading}
          value={cashQuery.data ? 'En curso' : 'Cerrada'}
        />
      </CardContent>
    </Card>
  )
}

function HomeStat({
  label,
  value,
  loading,
}: {
  label: string
  value?: string
  loading: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className="mt-1 truncate text-lg font-semibold tabular-nums">
          {value ?? '—'}
        </p>
      )}
    </div>
  )
}

export default HomePage
