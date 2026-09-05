import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, Lock, Pencil, Plus, Power } from 'lucide-react'
import {
  createUser,
  getApiErrorMessage,
  getRoles,
  getUsers,
  updateUser,
  updateUserStatus,
  verifyUsersPanelPassword,
  type CreateUserPayload,
  type Role,
  type UpdateUserPayload,
  type User,
} from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const GATE_KEY = 'users-panel-unlocked'

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')

  const verify = useMutation({
    mutationFn: () => verifyUsersPanelPassword(password),
    onSuccess: onUnlock,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    verify.mutate()
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="size-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight">
                Panel de usuarios
              </h1>
              <p className="text-sm text-muted-foreground">
                Ingresa la contraseña para continuar.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gate-password">Contraseña</Label>
              <Input
                id="gate-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
              {verify.isError && (
                <p className="text-sm text-destructive">
                  {getApiErrorMessage(verify.error)}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={verify.isPending}>
              {verify.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {verify.isPending ? 'Verificando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function UsersPanel({ onLock }: { onLock: () => void }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [userDialog, setUserDialog] = useState<{
    open: boolean
    user: User | null
  }>({ open: false, user: null })
  const [statusTarget, setStatusTarget] = useState<User | null>(null)

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const saveUser = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateUserPayload | UpdateUserPayload
    }) =>
      id
        ? updateUser(id, payload as UpdateUserPayload)
        : createUser(payload as CreateUserPayload),
    onSuccess: async () => {
      await invalidate()
      setUserDialog({ open: false, user: null })
      toast.success('Usuario guardado')
    },
    onError: (error) => toastError(error),
  })

  const toggleStatus = useMutation({
    mutationFn: () => updateUserStatus(statusTarget!.id, !statusTarget!.active),
    onSuccess: async () => {
      await invalidate()
      setStatusTarget(null)
      toast.success('Estado del usuario actualizado')
    },
    onError: (error) => toastError(error),
  })

  if (usersQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Card>
          <CardContent className="space-y-3 pt-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (usersQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">
          {getApiErrorMessage(usersQuery.error)}
        </p>
        <Button variant="outline" onClick={() => usersQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  const users = usersQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Crea y administra los accesos del personal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLock}
            title="Bloquear el panel"
          >
            <Lock className="size-4" />
            Bloquear
          </Button>
          <Button onClick={() => setUserDialog({ open: true, user: null })}>
            <Plus className="size-4" />
            Nuevo usuario
          </Button>
        </div>
      </div>

      <Card>
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Aún no hay usuarios registrados.
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2">
                          Tú
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role.label}</TableCell>
                    <TableCell>
                      <Badge variant={user.active ? 'default' : 'secondary'}>
                        {user.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUserDialog({ open: true, user })}
                          title={isSelf ? 'No puedes editar tu propio rol' : 'Editar usuario'}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Editar usuario</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSelf}
                          onClick={() => setStatusTarget(user)}
                          title={
                            isSelf
                              ? 'No puedes desactivar tu propia cuenta'
                              : user.active
                                ? 'Desactivar usuario'
                                : 'Activar usuario'
                          }
                        >
                          <Power className="size-4" />
                          <span className="sr-only">Cambiar estado</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <ul className="divide-y px-6 lg:hidden">
          {users.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay usuarios registrados.
            </li>
          )}
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            return (
              <li key={user.id} className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {user.name}
                    {isSelf && <Badge variant="outline">Tú</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{user.role.label}</Badge>
                    <Badge variant={user.active ? 'default' : 'secondary'}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <span>{formatDate(user.createdAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUserDialog({ open: true, user })}
                    title={isSelf ? 'No puedes editar tu propio rol' : 'Editar usuario'}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">Editar usuario</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isSelf}
                    onClick={() => setStatusTarget(user)}
                    title={
                      isSelf
                        ? 'No puedes desactivar tu propia cuenta'
                        : user.active
                          ? 'Desactivar usuario'
                          : 'Activar usuario'
                    }
                  >
                    <Power className="size-4" />
                    <span className="sr-only">Cambiar estado</span>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <UserDialog
        open={userDialog.open}
        user={userDialog.user}
        roles={rolesQuery.data ?? []}
        isSelf={userDialog.user?.id === currentUserId}
        isSubmitting={saveUser.isPending}
        error={saveUser.error}
        onOpenChange={(open) => setUserDialog((s) => ({ ...s, open }))}
        onSubmit={(payload) =>
          saveUser.mutate({ id: userDialog.user?.id, payload })
        }
      />

      <StatusConfirmDialog
        target={statusTarget}
        isSubmitting={toggleStatus.isPending}
        error={toggleStatus.error}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        onConfirm={() => toggleStatus.mutate()}
      />
    </div>
  )
}

function UserDialog({
  open,
  user,
  roles,
  isSelf,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  user: User | null
  roles: Role[]
  isSelf: boolean
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateUserPayload | UpdateUserPayload) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')

  const editing = Boolean(user)

  function reset() {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setPassword('')
    setRoleId(user?.role.id ?? roles[0]?.id ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      const payload: UpdateUserPayload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
      }
      if (roleId && roleId !== user?.role.id) payload.roleId = roleId
      if (password) payload.password = password
      onSubmit(payload)
    } else {
      onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        roleId,
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar usuario' : 'Nuevo usuario'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos del usuario.'
                : 'Crea un nuevo acceso para el personal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Nombre</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. María Pérez"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Correo</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@restobar.pe"
                maxLength={255}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Rol</Label>
              <Select value={roleId} onValueChange={setRoleId} disabled={isSelf}>
                <SelectTrigger className="w-full" id="user-role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">
                  No puedes cambiar tu propio rol.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">
                {editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Dejar en blanco para no cambiarla' : 'Mínimo 6 caracteres'}
                minLength={6}
                maxLength={128}
                required={!editing}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(error)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StatusConfirmDialog({
  target,
  isSubmitting,
  error,
  onOpenChange,
  onConfirm,
}: {
  target: User | null
  isSubmitting: boolean
  error: Error | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const activating = Boolean(target && !target.active)

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {activating ? '¿Activar usuario?' : '¿Desactivar usuario?'}
          </DialogTitle>
          <DialogDescription>
            {activating
              ? `«${target?.name}» podrá volver a iniciar sesión.`
              : `«${target?.name}» ya no podrá iniciar sesión.`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">
            {getApiErrorMessage(error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            variant={activating ? 'default' : 'destructive'}
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {activating ? 'Activar' : 'Desactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UsersPage() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(GATE_KEY) === '1',
  )

  function handleUnlock() {
    sessionStorage.setItem(GATE_KEY, '1')
    setUnlocked(true)
  }

  function handleLock() {
    sessionStorage.removeItem(GATE_KEY)
    setUnlocked(false)
  }

  if (!unlocked) {
    return <PasswordGate onUnlock={handleUnlock} />
  }

  return <UsersPanel onLock={handleLock} />
}

export default UsersPage
