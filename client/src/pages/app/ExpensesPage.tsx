import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Tag,
  Trash2,
} from 'lucide-react'
import {
  createExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  getApiErrorMessage,
  getExpenses,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseFilters,
  type ExpensePayload,
} from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type RangeKey = 'today' | 'week' | 'month' | 'all'

const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  all: 'Todo',
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  )
}

function startOfWeek(date: Date): Date {
  const day = date.getDay()
  const diff = (day + 6) % 7 // lunes = 0
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff))
}

function rangeToFilters(
  range: RangeKey,
  category: ExpenseCategory | 'ALL',
): ExpenseFilters {
  const now = new Date()
  const filters: ExpenseFilters = {}
  if (category !== 'ALL') filters.category = category

  if (range === 'today') {
    filters.from = startOfDay(now).toISOString()
    filters.to = endOfDay(now).toISOString()
  } else if (range === 'week') {
    filters.from = startOfWeek(now).toISOString()
    filters.to = endOfDay(now).toISOString()
  } else if (range === 'month') {
    filters.from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    filters.to = endOfDay(now).toISOString()
  }

  return filters
}

function isoToDateInput(value: string): string {
  const d = new Date(value)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function dateInputToISO(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function todayInput(): string {
  return isoToDateInput(new Date().toISOString())
}

interface DayGroup {
  date: string
  total: number
  expenses: Expense[]
}

function groupByDay(expenses: Expense[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const expense of expenses) {
    const key = isoToDateInput(expense.incurredAt)
    const group = groups.get(key) ?? { date: key, total: 0, expenses: [] }
    group.expenses.push(expense)
    group.total = Math.round((group.total + expense.amount) * 100) / 100
    groups.set(key, group)
  }
  return [...groups.values()]
}

function ExpensesPage() {
  const queryClient = useQueryClient()
  const [range, setRange] = useState<RangeKey>('month')
  const [category, setCategory] = useState<ExpenseCategory | 'ALL'>('ALL')
  const [dialog, setDialog] = useState<{ open: boolean; expense: Expense | null }>(
    { open: false, expense: null },
  )
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  const filters = useMemo(
    () => rangeToFilters(range, category),
    [range, category],
  )

  const { data: expenses, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => getExpenses(filters),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  const saveExpense = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: ExpensePayload
    }) =>
      id ? updateExpense(id, payload) : createExpense(payload),
    onSuccess: async () => {
      await invalidate()
      setDialog({ open: false, expense: null })
      toast.success('Gasto guardado')
    },
    onError: (error) => toastError(error),
  })

  const remove = useMutation({
    mutationFn: () => deleteExpense(deleteTarget!.id),
    onSuccess: async () => {
      await invalidate()
      setDeleteTarget(null)
      toast.success('Gasto eliminado')
    },
    onError: (error) => toastError(error),
  })

  const groups = useMemo(() => groupByDay(expenses ?? []), [expenses])
  const total = Math.round((expenses ?? []).reduce((sum, e) => sum + e.amount, 0) * 100) / 100
  const count = expenses?.length ?? 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-52" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">{getApiErrorMessage(error)}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Registra los gastos diarios del negocio y consulta su total.
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true, expense: null })}>
          <Plus className="size-4" />
          Registrar gasto
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Total del período
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Gastos registrados
          </p>
          <p className="mt-1 text-2xl font-semibold">{count}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                range === option
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {RANGE_LABEL[option]}
            </button>
          ))}
        </div>

        <Select
          value={category}
          onValueChange={(value) => setCategory(value as ExpenseCategory | 'ALL')}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las categorías</SelectItem>
            {EXPENSE_CATEGORIES.map((option) => (
              <SelectItem key={option} value={option}>
                {EXPENSE_CATEGORY_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {count === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-center">
          <Receipt className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            No hay gastos registrados en este período.
          </p>
          <Button
            variant="outline"
            onClick={() => setDialog({ open: true, expense: null })}
          >
            <Plus className="size-4" />
            Registrar gasto
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Detalle de gastos
            </CardTitle>
            <CardDescription>
              {count} {count === 1 ? 'gasto' : 'gastos'} ·{' '}
              {formatCurrency(total)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {groups.map((group) => (
              <div key={group.date} className="space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    {formatDate(group.date)}
                  </p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(group.total)}
                  </p>
                </div>
                <div className="divide-y">
                  {group.expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {expense.description}
                          <Badge variant="outline">
                            <Tag className="size-3" />
                            {EXPENSE_CATEGORY_LABEL[expense.category]}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Registrado por {expense.registeredBy.name}
                          {expense.note ? ` · ${expense.note}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">
                          {formatCurrency(expense.amount)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar gasto"
                            onClick={() =>
                              setDialog({ open: true, expense })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar gasto"
                            onClick={() => setDeleteTarget(expense)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ExpenseDialog
        open={dialog.open}
        expense={dialog.expense}
        isSubmitting={saveExpense.isPending}
        error={saveExpense.error}
        onOpenChange={(open) => {
          if (!open) setDialog({ open: false, expense: null })
        }}
        onSubmit={(payload) =>
          saveExpense.mutate({ id: dialog.expense?.id, payload })
        }
      />

      <ConfirmDeleteDialog
        target={
          deleteTarget
            ? {
                kind: 'gasto',
                id: deleteTarget.id,
                name: deleteTarget.description,
              }
            : null
        }
        isSubmitting={remove.isPending}
        error={remove.error}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}

function ExpenseDialog({
  open,
  expense,
  isSubmitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  expense: Expense | null
  isSubmitting: boolean
  error: Error | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: ExpensePayload) => void
}) {
  const editing = Boolean(expense)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('INSUMOS')
  const [incurredAt, setIncurredAt] = useState(todayInput())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setDescription(expense?.description ?? '')
    setAmount(expense ? String(expense.amount) : '')
    setCategory(expense?.category ?? 'INSUMOS')
    setIncurredAt(expense ? isoToDateInput(expense.incurredAt) : todayInput())
    setNote(expense?.note ?? '')
  }, [open, expense])

  const parsedAmount = Math.round(parseFloat(amount.replace(',', '.')) * 100) / 100
  const valid =
    description.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      description: description.trim(),
      amount: parsedAmount,
      category,
      incurredAt: dateInputToISO(incurredAt),
      note: note.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar gasto' : 'Registrar gasto'}
            </DialogTitle>
            <DialogDescription>
              Anota el gasto del día con su monto, categoría y fecha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expense-description">Descripción</Label>
              <Input
                id="expense-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Compra de verduras"
                maxLength={120}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Monto (S/)</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-date">Fecha</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={incurredAt}
                  onChange={(e) => setIncurredAt(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={category}
                onValueChange={(value) =>
                  setCategory(value as ExpenseCategory)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {EXPENSE_CATEGORY_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-note">Nota (opcional)</Label>
              <Textarea
                id="expense-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="Detalle adicional del gasto"
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
            <Button type="submit" disabled={isSubmitting || !valid}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Registrar gasto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ExpensesPage
