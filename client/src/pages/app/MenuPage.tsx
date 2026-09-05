import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getCategories,
  updateCategory,
  updateProduct,
  type MenuCategory,
  type MenuProduct,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
  type CreateProductPayload,
  type UpdateProductPayload,
} from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { toastError } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { formatCurrency } from '@/lib/format'

function MenuPage() {
  const queryClient = useQueryClient()
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean
    category: MenuCategory | null
  }>({ open: false, category: null })
  const [productDialog, setProductDialog] = useState<{
    open: boolean
    product: MenuProduct | null
    defaultCategoryId?: string
  }>({ open: false, product: null })
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'category'; id: string; name: string }
    | { kind: 'product'; id: string; name: string }
    | null
  >(null)

  const { data: categories, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] })

  const saveCategory = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateCategoryPayload | UpdateCategoryPayload
    }) =>
      id
        ? updateCategory(id, payload as UpdateCategoryPayload)
        : createCategory(payload as CreateCategoryPayload),
    onSuccess: async () => {
      await invalidate()
      setCategoryDialog({ open: false, category: null })
      toast.success('Categoría guardada')
    },
    onError: (error) => toastError(error),
  })

  const saveProduct = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: string
      payload: CreateProductPayload | UpdateProductPayload
    }) =>
      id
        ? updateProduct(id, payload as UpdateProductPayload)
        : createProduct(payload as CreateProductPayload),
    onSuccess: async () => {
      await invalidate()
      setProductDialog({ open: false, product: null })
      toast.success('Producto guardado')
    },
    onError: (error) => toastError(error),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return
      if (deleteTarget.kind === 'category') {
        await deleteCategory(deleteTarget.id)
      } else {
        await deleteProduct(deleteTarget.id)
      }
    },
    onSuccess: async () => {
      await invalidate()
      setDeleteTarget(null)
      toast.success('Eliminado')
    },
    onError: (error) => toastError(error),
  })

  const toggleProduct = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateProduct(id, { active }),
    onSuccess: invalidate,
    onError: (error) => toastError(error),
  })

  const toggleCategory = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateCategory(id, { active }),
    onSuccess: invalidate,
    onError: (error) => toastError(error),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">
          {getApiErrorMessage(error)}
        </p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Menú</h1>
          <p className="text-sm text-muted-foreground">
            Administra categorías y productos del menú.
          </p>
        </div>
        <Button
          onClick={() => setCategoryDialog({ open: true, category: null })}
        >
          <Plus className="size-4" />
          Nueva categoría
        </Button>
      </div>

      {categories?.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-center">
          <p className="text-muted-foreground">
            Aún no hay categorías. Crea la primera.
          </p>
          <Button
            variant="outline"
            onClick={() => setCategoryDialog({ open: true, category: null })}
          >
            <Plus className="size-4" />
            Nueva categoría
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {categories?.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onNewProduct={() =>
                setProductDialog({
                  open: true,
                  product: null,
                  defaultCategoryId: category.id,
                })
              }
              onEditCategory={() =>
                setCategoryDialog({ open: true, category })
              }
              onEditProduct={(product) =>
                setProductDialog({ open: true, product })
              }
              onDeleteCategory={() =>
                setDeleteTarget({
                  kind: 'category',
                  id: category.id,
                  name: category.name,
                })
              }
              onDeleteProduct={(product) =>
                setDeleteTarget({
                  kind: 'product',
                  id: product.id,
                  name: product.name,
                })
              }
              onToggleCategory={(active) =>
                toggleCategory.mutate({ id: category.id, active })
              }
              onToggleProduct={(product, active) =>
                toggleProduct.mutate({ id: product.id, active })
              }
            />
          ))}
        </div>
      )}

      <CategoryDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        onOpenChange={(open) =>
          setCategoryDialog((s) => ({ ...s, open }))
        }
        isSubmitting={saveCategory.isPending}
        error={saveCategory.error}
        onSubmit={(payload) =>
          saveCategory.mutate({
            id: categoryDialog.category?.id,
            payload,
          })
        }
      />

      <ProductDialog
        open={productDialog.open}
        product={productDialog.product}
        categories={categories ?? []}
        defaultCategoryId={productDialog.defaultCategoryId}
        onOpenChange={(open) =>
          setProductDialog((s) => ({ ...s, open }))
        }
        isSubmitting={saveProduct.isPending}
        error={saveProduct.error}
        onSubmit={(payload) =>
          saveProduct.mutate({
            id: productDialog.product?.id,
            payload,
          })
        }
      />

      <ConfirmDeleteDialog
        target={deleteTarget}
        isSubmitting={remove.isPending}
        error={remove.error}
        description={
          deleteTarget?.kind === 'category'
            ? `La categoría "${deleteTarget.name}" se eliminará de forma permanente. Solo se permite si no tiene productos asociados.`
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}

function CategoryCard({
  category,
  onNewProduct,
  onEditCategory,
  onEditProduct,
  onDeleteCategory,
  onDeleteProduct,
  onToggleCategory,
  onToggleProduct,
}: {
  category: MenuCategory
  onNewProduct: () => void
  onEditCategory: () => void
  onEditProduct: (product: MenuProduct) => void
  onDeleteCategory: () => void
  onDeleteProduct: (product: MenuProduct) => void
  onToggleCategory: (active: boolean) => void
  onToggleProduct: (product: MenuProduct, active: boolean) => void
}) {
  const activeProducts = category.products.filter((p) => p.active).length

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{category.name}</CardTitle>
          <Badge variant="secondary">
            {category.products.length}{' '}
            {category.products.length === 1 ? 'producto' : 'productos'}
          </Badge>
          {!category.active && <Badge variant="outline">Oculta</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onNewProduct}>
            <Plus className="size-4" />
            Producto
          </Button>
          <Button variant="ghost" size="icon" onClick={onEditCategory}>
            <Pencil className="size-4" />
            <span className="sr-only">Editar categoría</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={onDeleteCategory}>
            <Trash2 className="size-4" />
            <span className="sr-only">Eliminar categoría</span>
          </Button>
          <div className="flex items-center gap-2 border-l pl-3">
            <Switch
              checked={category.active}
              onCheckedChange={onToggleCategory}
              aria-label={`Activar categoría ${category.name}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {category.products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin productos todavía.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-28">Activo</TableHead>
                    <TableHead className="w-20 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.products.map((product) => (
                    <TableRow
                      key={product.id}
                      className={
                        product.active ? '' : 'text-muted-foreground opacity-60'
                      }
                    >
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell className="max-w-xs truncate whitespace-normal text-muted-foreground">
                        {product.description ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(product.price)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={product.active ? 'default' : 'outline'}
                        >
                          {product.active ? 'Disponible' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={product.active}
                          onCheckedChange={(active) =>
                            onToggleProduct(product, active)
                          }
                          aria-label={`Activar producto ${product.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEditProduct(product)}
                          >
                            <Pencil className="size-4" />
                            <span className="sr-only">Editar {product.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDeleteProduct(product)}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Eliminar {product.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y lg:hidden">
              {category.products.map((product) => (
                <li
                  key={product.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`font-medium ${product.active ? '' : 'text-muted-foreground'}`}
                      >
                        {product.name}
                      </p>
                      {!product.active && <Badge variant="outline">Inactivo</Badge>}
                    </div>
                    {product.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {product.description}
                      </p>
                    )}
                    <p className="mt-1 font-semibold tabular-nums">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={product.active}
                      onCheckedChange={(active) =>
                        onToggleProduct(product, active)
                      }
                      aria-label={`Activar producto ${product.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditProduct(product)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Editar {product.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteProduct(product)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Eliminar {product.name}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{activeProducts} disponibles</span>
        </div>
      </CardContent>
    </Card>
  )
}

function CategoryDialog({
  open,
  category,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  category: MenuCategory | null
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateCategoryPayload & { active?: boolean }) => void
}) {
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)

  const editing = Boolean(category)

  function reset() {
    setName(category?.name ?? '')
    setSortOrder(String(category?.sortOrder ?? 0))
    setActive(category?.active ?? true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      sortOrder: Number(sortOrder || 0),
      ...(editing ? { active } : {}),
    })
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
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza la información de la categoría.'
                : 'Crea una categoría para agrupar productos.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Nombre</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Platos fuertes"
                required
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category-order">Orden</Label>
                <Input
                  id="category-order"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
              {editing && (
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    checked={active}
                    onCheckedChange={setActive}
                    id="category-active"
                  />
                  <Label htmlFor="category-active">Visible</Label>
                </div>
              )}
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
              {editing ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProductDialog({
  open,
  product,
  categories,
  defaultCategoryId,
  onOpenChange,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean
  product: MenuProduct | null
  categories: MenuCategory[]
  defaultCategoryId?: string
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  error: Error | null
  onSubmit: (payload: CreateProductPayload) => void
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)

  const editing = Boolean(product)

  function reset() {
    setName(product?.name ?? '')
    setPrice(product ? String(product.price) : '')
    setDescription(product?.description ?? '')
    setCategoryId(
      product?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '',
    )
    setSortOrder(String(product?.sortOrder ?? 0))
    setActive(product?.active ?? true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      price: Number(price),
      description: description.trim() || undefined,
      categoryId,
      sortOrder: Number(sortOrder || 0),
      ...(editing ? { active } : {}),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza la información del producto.'
                : 'Agrega un producto al menú.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Nombre</Label>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Filete a la parrilla"
                required
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-category">Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="product-category" className="w-full">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-price">Precio (S/)</Label>
                <Input
                  id="product-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-description">Descripción</Label>
              <Textarea
                id="product-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción del platillo (opcional)"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-order">Orden</Label>
                <Input
                  id="product-order"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
              {editing && (
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    checked={active}
                    onCheckedChange={setActive}
                    id="product-active"
                  />
                  <Label htmlFor="product-active">Disponible</Label>
                </div>
              )}
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
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default MenuPage
