import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isOperator } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

interface ProtectedRouteProps {
  permission?: string
  children?: ReactNode
}

export function ProtectedRoute({ permission, children }: ProtectedRouteProps) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (permission && !user.permissions.includes(permission)) {
    return <Navigate to={isOperator(user) ? '/admin' : '/app'} replace />
  }

  return children ? <>{children}</> : <Outlet />
}
