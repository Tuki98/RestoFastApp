import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Plus, Power } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  createOrgUser,
  getApiErrorMessage,
  getOrgUsers,
  getOrganizations,
  getRoles,
  updateOrgUser,
  updateOrgUserStatus,
  type CreateUserPayload,
  type Role,
  type UpdateUserPayload,
  type User,
} from '@/lib/api'
import { UserLimitBar } from '@/components/UserLimitBar'
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

function AdminOrganizationUsersPage() {
  const { orgId = '' } = useParams()
  const queryClient = useQueryClient()
  const [userDialog, setUserDialog] = useState<{
    open: boolean
    user: User | null
  }>({ open: false, user: null })
  const [statusTarget, setStatusTarget] = useState<User | null>(null)

  const orgsQuery = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: getOrganizations,
  })
  const usersQuery = useQuery({
    queryKey: ['admin', 'organizations', orgId, 'users'],
    queryFn: () => getOrgUsers(orgId),
  })
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  })

  const org = orgsQuery.data?.find((o) => o.id === orgId)

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['admin', 'organizations', orgId, 'users'],
    })

  const saveUser = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateUserPayload | UpdateUserPayload
    }) =>
      id
        ? updateOrgUser(orgId, id, payload as UpdateUserPayload)
        : createOrgUser(orgId, payload as CreateUserPayload),
    onSuccess: async () => {
      await invalidate()
      setUserDialog({ open: false, user: null })
      toast.success('Usuario guardado')
    },
    onError: (error) => toastError(error),
  })

  const toggleStatus = useMutation({
    mutationFn: () =>
      updateOrgUserStatus(orgId, statusTarget!.id, !statusTarget!.active),
    onSuccess: async () => {
      await invalidate()
      setStatusTarget(null)
      toast.success('Estado del usuario actualizado')
    },
    onError: (error) => toastError(error),
  })

  if (usersQuery.isLoading || orgsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardContent className="space-y-3 pt-4">
            {[0, 1, 2, 3].map((i) => (
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
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/admin/organizations">
              <ArrowLeft className="size-4" />
              Volver a organizaciones
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Usuarios de {org?.name ?? 'la organización'}
          </h1>
          <p className="text-sm text-muted-foreground">{org?.slug}</p>
        </div>
        <Button onClick={() => setUserDialog({ open: true, user: null })}>
          <Plus className="size-4" />
          Nuevo usuario
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Uso de usuarios</p>
            <p className="text-xs text-muted-foreground">
              Cantidad frente al límite definido por el operador.
            </p>
          </div>
          <UserLimitBar
            users={users.length}
            max={org?.maxUsers ?? null}
            className="w-64"
          />
        </div>
      </Card>

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
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
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
                        title="Editar usuario"
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">Editar usuario</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatusTarget(user)}
                        title={user.active ? 'Desactivar usuario' : 'Activar usuario'}
                      >
                        <Power className="size-4" />
                        <span className="sr-only">Cambiar estado</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="divide-y px-6 lg:hidden">
          {users.map((user) => (
            <li key={user.id} className="flex items-start justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name}</p>
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
                  title="Editar usuario"
                >
                  <Pencil className="size-4" />
                  <span className="sr-only">Editar usuario</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStatusTarget(user)}
                  title={user.active ? 'Desactivar usuario' : 'Activar usuario'}
                >
                  <Power className="size-4" />
                  <span className="sr-only">Cambiar estado</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <OrgUserDialog
        open={userDialog.open}
        user={userDialog.user}
        roles={rolesQuery.data ?? []}
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

function OrgUserDialog({
  open,
  user,
  roles,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  user: User | null
  roles: Role[]
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
                : 'Crea un acceso para el personal de la organización.'}
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
              <Select value={roleId} onValueChange={setRoleId}>
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

export default AdminOrganizationUsersPage
