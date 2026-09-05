import type { FormEvent } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Martini } from 'lucide-react'
import { getApiErrorMessage, isOperator, login } from '@/lib/api'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
      if (isOperator(data.user)) {
        navigate('/admin', { replace: true })
        return
      }
      const from = (location.state as { from?: string } | null)?.from ?? '/app'
      navigate(from, { replace: true })
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/50 p-6">
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-amber-500/10 blur-3xl" />

      <ThemeToggle className="absolute top-6 right-6 bg-background/70 backdrop-blur" />

      <Card className="w-full max-w-sm border-0 shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md">
            <Martini className="size-6" />
          </div>
          <CardTitle className="text-2xl tracking-tight">
            RestobarService
          </CardTitle>
          <CardDescription>
            Inicia sesión para acceder al panel de tu restaurante
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@correo.pe"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput
                id="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(mutation.error)}
              </p>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="mt-2"
            >
              {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta?{' '}
            <Link to="/register" className="hover:underline">
              Crea tu restaurante
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← Volver al inicio
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default LoginPage
