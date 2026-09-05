import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  createOrganization,
  getApiErrorMessage,
  getOrganizations,
  updateOrganization,
  type CreateOrganizationPayload,
  type Organization,
  type OrgPlan,
  type UpdateOrganizationPayload,
} from '@/lib/api'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { UserLimitBar } from '@/components/UserLimitBar'
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

const PLAN_LABELS: Record<OrgPlan, string> = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
}

const PLAN_VARIANTS: Record<OrgPlan, 'default' | 'secondary' | 'outline'> = {
  TRIAL: 'secondary',
  ACTIVE: 'default',
  PAUSED: 'outline',
}

function PlanBadge({ plan }: { plan: OrgPlan }) {
  return <Badge variant={PLAN_VARIANTS[plan]}>{PLAN_LABELS[plan]}</Badge>
}

function AdminOrganizationsPage() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{
    open: boolean
    org: Organization | null
  }>({ open: false, org: null })

  const orgsQuery = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: getOrganizations,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] })

  const saveOrg = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateOrganizationPayload | UpdateOrganizationPayload
    }) =>
      id
        ? updateOrganization(id, payload as UpdateOrganizationPayload)
        : createOrganization(payload as CreateOrganizationPayload),
    onSuccess: async (_, variables) => {
      await invalidate()
      setDialog({ open: false, org: null })
      toast.success(
        variables.id ? 'Organización actualizada' : 'Organización creada',
      )
    },
    onError: (error) => toastError(error),
  })

  const togglePlan = useMutation({
    mutationFn: (org: Organization) =>
      updateOrganization(org.id, {
        plan: org.plan === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
      }),
    onSuccess: () => invalidate(),
    onError: (error) => toastError(error),
  })

  if (orgsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-10 w-40" />
        </div>
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

  if (orgsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">
          {getApiErrorMessage(orgsQuery.error)}
        </p>
        <Button variant="outline" onClick={() => orgsQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  const orgs = orgsQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Registra negocios, administra su plan y su límite de usuarios.
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true, org: null })}>
          <Plus className="size-4" />
          Nueva organización
        </Button>
      </div>

      <Card>
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Órdenes</TableHead>
                <TableHead>Sesiones de caja</TableHead>
                <TableHead>Fin de prueba</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {org.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={org.plan} />
                  </TableCell>
                  <TableCell>
                    <UserLimitBar users={org.usersCount} max={org.maxUsers} />
                  </TableCell>
                  <TableCell className="tabular-nums">{org.ordersCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {org.cashSessionsCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.trialEndsAt ? formatDate(org.trialEndsAt) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(org.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="Ver usuarios"
                      >
                        <Link to={`/admin/organizations/${org.id}/users`}>
                          <Eye className="size-4" />
                          <span className="sr-only">Ver usuarios</span>
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, org })}
                        title="Editar organización"
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={togglePlan.isPending}
                        onClick={() => togglePlan.mutate(org)}
                        className="text-muted-foreground"
                      >
                        {org.plan === 'PAUSED' ? 'Activar' : 'Suspender'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="divide-y px-6 lg:hidden">
          {orgs.map((org) => (
            <li key={org.id} className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{org.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {org.slug}
                  </p>
                </div>
                <PlanBadge plan={org.plan} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Usuarios</p>
                  <UserLimitBar users={org.usersCount} max={org.maxUsers} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Órdenes</p>
                  <p className="font-semibold tabular-nums">
                    {org.ordersCount}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Cajas</p>
                  <p className="font-semibold tabular-nums">
                    {org.cashSessionsCount}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Fin de prueba: {org.trialEndsAt ? formatDate(org.trialEndsAt) : '—'}{' '}
                · Creado: {formatDate(org.createdAt)}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/admin/organizations/${org.id}/users`}>
                    <Eye className="size-4" />
                    Usuarios
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDialog({ open: true, org })}
                  title="Editar organización"
                >
                  <Pencil className="size-4" />
                  <span className="sr-only">Editar</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={togglePlan.isPending}
                  onClick={() => togglePlan.mutate(org)}
                  className="text-muted-foreground"
                >
                  {org.plan === 'PAUSED' ? 'Activar' : 'Suspender'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <OrganizationDialog
        open={dialog.open}
        org={dialog.org}
        isSubmitting={saveOrg.isPending}
        error={saveOrg.error}
        onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
        onSubmit={(payload) =>
          saveOrg.mutate({ id: dialog.org?.id, payload })
        }
      />
    </div>
  )
}

function OrganizationDialog({
  open,
  org,
  isSubmitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  org: Organization | null
  isSubmitting: boolean
  error: Error | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: CreateOrganizationPayload | UpdateOrganizationPayload) => void
}) {
  const [name, setName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [usersPanelPassword, setUsersPanelPassword] = useState('')
  const [plan, setPlan] = useState<OrgPlan>('TRIAL')
  const [maxUsers, setMaxUsers] = useState('5')
  const [unlimited, setUnlimited] = useState(false)
  const [trialEndsAt, setTrialEndsAt] = useState('')

  const editing = Boolean(org)

  function reset() {
    setName(org?.name ?? '')
    setAdminName('')
    setAdminEmail('')
    setAdminPassword('')
    setUsersPanelPassword('')
    setPlan(org?.plan ?? 'TRIAL')
    const max = org?.maxUsers
    setMaxUsers(max != null ? String(max) : '5')
    setUnlimited(max == null && !editing)
    setTrialEndsAt(org?.trialEndsAt ? toDateInput(org.trialEndsAt) : '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      const payload: UpdateOrganizationPayload = {
        name: name.trim(),
        plan,
        maxUsers: unlimited ? null : Number(maxUsers),
        trialEndsAt: trialEndsAt
          ? new Date(trialEndsAt).toISOString()
          : null,
      }
      if (usersPanelPassword) payload.usersPanelPassword = usersPanelPassword
      onSubmit(payload)
    } else {
      onSubmit({
        organizationName: name.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        usersPanelPassword,
        plan,
        maxUsers: unlimited ? undefined : Number(maxUsers),
        trialEndsAt: trialEndsAt
          ? new Date(trialEndsAt).toISOString()
          : undefined,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar organización' : 'Nueva organización'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza el plan, el límite o la contraseña del panel.'
                : 'Crea un negocio con su administrador y contraseña de gestión.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nombre del negocio</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Restobar El Puerto"
                maxLength={80}
                required
              />
            </div>

            {!editing && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-name">Admin: nombre</Label>
                    <Input
                      id="org-admin-name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Ana Pérez"
                      maxLength={120}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin-email">Admin: correo</Label>
                    <Input
                      id="org-admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="ana@resto.pe"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-admin-password">
                    Admin: contraseña (mínimo 8)
                  </Label>
                  <Input
                    id="org-admin-password"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="org-panel-password">
                {editing
                  ? 'Contraseña del panel de usuarios (dejar en blanco para no cambiarla)'
                  : 'Contraseña del panel de usuarios de la org'}
              </Label>
              <Input
                id="org-panel-password"
                type="password"
                value={usersPanelPassword}
                onChange={(e) => setUsersPanelPassword(e.target.value)}
                placeholder={editing ? 'Nueva contraseña (opcional)' : 'Mínimo 4 caracteres'}
                minLength={4}
                required={!editing}
              />
              <p className="text-xs text-muted-foreground">
                La organización la usará para entrar a su gestión de usuarios.
                Solo puede resetearse, no se puede consultar.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-plan">Plan</Label>
                <Select value={plan} onValueChange={(v) => setPlan(v as OrgPlan)}>
                  <SelectTrigger className="w-full" id="org-plan">
                    <SelectValue placeholder="Selecciona un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Prueba</SelectItem>
                    <SelectItem value="ACTIVE">Activa</SelectItem>
                    <SelectItem value="PAUSED">Pausada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-trial">Fin de prueba</Label>
                <Input
                  id="org-trial"
                  type="date"
                  value={trialEndsAt}
                  onChange={(e) => setTrialEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Límite de usuarios</Label>
              <div className="flex items-end gap-3">
                <Input
                  type="number"
                  min={1}
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(e.target.value)}
                  disabled={unlimited}
                  className="max-w-[160px]"
                  aria-label="Límite de usuarios"
                />
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => setUnlimited(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Ilimitado
                </label>
              </div>
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
              {editing ? 'Guardar cambios' : 'Crear organización'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function toDateInput(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export default AdminOrganizationsPage
