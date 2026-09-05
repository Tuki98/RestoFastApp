import type { FormEvent } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Martini } from 'lucide-react'
import { getApiErrorMessage, isOperator, register } from '@/lib/api'
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

function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [organizationName, setOrganizationName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      register({ organizationName, name, email, password }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
      navigate(isOperator(data.user) ? '/admin' : '/app', { replace: true })
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
            Crea tu restaurante
          </CardTitle>
          <CardDescription>
            Registra tu negocio y comienza con 15 días de prueba
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="organizationName">Nombre del negocio</Label>
              <Input
                id="organizationName"
                required
                maxLength={80}
                placeholder="Restobar El Puerto"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Tu nombre</Label>
              <Input
                id="name"
                required
                maxLength={60}
                autoComplete="name"
                placeholder="María García"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
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
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
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
              {mutation.isPending ? 'Creando negocio…' : 'Crear negocio'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes una cuenta?{' '}
            <Link to="/login" className="hover:underline">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default RegisterPage
