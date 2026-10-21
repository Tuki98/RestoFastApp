import { Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import StaffLayout from '@/layouts/StaffLayout'
import AdminLayout from '@/layouts/AdminLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { isOperator } from '@/lib/api'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { useAuthStore } from '@/stores/authStore'
import { Toaster } from '@/components/ui/toaster'
import PlaceholderPage from '@/pages/app/PlaceholderPage'

const HomePage = lazyWithRetry(() => import('@/pages/HomePage'))
const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage'))
const RegisterPage = lazyWithRetry(() => import('@/pages/RegisterPage'))
const CartaPage = lazyWithRetry(() => import('@/pages/CartaPage'))
const PosPage = lazyWithRetry(() => import('@/pages/app/PosPage'))
const KitchenPage = lazyWithRetry(() => import('@/pages/app/KitchenPage'))
const MenuPage = lazyWithRetry(() => import('@/pages/app/MenuPage'))
const TablesPage = lazyWithRetry(() => import('@/pages/app/TablesPage'))
const InventoryPage = lazyWithRetry(() => import('@/pages/app/InventoryPage'))
const UsersPage = lazyWithRetry(() => import('@/pages/app/UsersPage'))
const CajaPage = lazyWithRetry(() => import('@/pages/app/CajaPage'))
const ExpensesPage = lazyWithRetry(() => import('@/pages/app/ExpensesPage'))
const ReportsPage = lazyWithRetry(() => import('@/pages/app/ReportsPage'))
const AdminOrganizationsPage = lazyWithRetry(
  () => import('@/pages/admin/AdminOrganizationsPage'),
)
const AdminOrganizationUsersPage = lazyWithRetry(
  () => import('@/pages/admin/AdminOrganizationUsersPage'),
)

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Cargando…
    </div>
  )
}

function NotFoundPage() {
  return (
    <PlaceholderPage
      title="Página no encontrada"
      description="La ruta que buscas no existe."
    />
  )
}

function StaffGuard() {
  const user = useAuthStore((state) => state.user)
  if (isOperator(user)) {
    return <Navigate to="/admin" replace />
  }
  return <Outlet />
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/menu/:qrToken" element={<CartaPage />} />

        <Route path="/app" element={<ProtectedRoute />}>
          <Route element={<StaffGuard />}>
          <Route element={<StaffLayout />}>
          <Route index element={<Navigate to="pos" replace />} />
          <Route
            path="pos"
            element={
              <ProtectedRoute permission="orders:create">
                <PosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="cocina"
            element={
              <ProtectedRoute permission="kitchen:view">
                <KitchenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu"
            element={
              <ProtectedRoute permission="menu:manage">
                <MenuPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tables"
            element={
              <ProtectedRoute permission="tables:manage">
                <TablesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="inventory"
            element={
              <ProtectedRoute permission="inventory:manage">
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="caja"
            element={
              <ProtectedRoute permission="caja:manage">
                <CajaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="gastos"
            element={
              <ProtectedRoute permission="expenses:manage">
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute permission="reports:view">
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="users"
            element={
              <ProtectedRoute permission="users:manage">
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>
        </Route>
        </Route>

      <Route path="/admin" element={<ProtectedRoute permission="system:manage" />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="organizations" replace />} />
          <Route path="organizations" element={<AdminOrganizationsPage />} />
          <Route
            path="organizations/:orgId/users"
            element={<AdminOrganizationUsersPage />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </Suspense>
  )
}

export default App
