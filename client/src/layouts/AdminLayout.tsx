import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Building2, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ConnectionBanner } from '@/components/ConnectionBanner'

const NAV_ITEMS = [
  {
    to: '/admin/organizations',
    label: 'Organizaciones',
    icon: Building2,
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((state) => state.user)
  const clear = useAuthStore((state) => state.clear)
  const navigate = useNavigate()

  function handleLogout() {
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b px-6 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <Link to="/admin" className="block text-base font-bold tracking-tight">
            RestobarService
          </Link>
          <p className="text-xs text-muted-foreground">Panel del operador</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Sistema
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/50 p-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground shadow-sm">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.role.label}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <Button variant="outline" className="flex-1" onClick={handleLogout}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </>
  )
}

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Aviso de conexión */}
      <ConnectionBanner />
      <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <Link to="/admin" className="text-lg font-bold tracking-tight">
          Panel del operador
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </Button>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          !mobileOpen && 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col bg-card shadow-lg transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </Button>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <SidebarContent />
      </aside>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen overflow-x-clip bg-muted/30 p-4 focus:outline-none md:ml-60 md:p-6"
      >
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
