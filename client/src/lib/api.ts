import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { getApiErrorMessage } from '@/lib/errors'

export { getApiErrorMessage }

export interface AuthUser {
  id: string
  name: string
  email: string
  organizationId: string | null
  role: {
    id: string
    name: string
    label: string
  }
  permissions: string[]
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export interface HealthStatus {
  status: string
  database: string
  timestamp: string
}

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
  return data
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  organizationName: string
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/register', payload)
  return data
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export function isOperator(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('system:manage'))
}

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await api.get<HealthStatus>('/health')
  return data
}

export interface MenuProduct {
  id: string
  name: string
  description: string | null
  price: number
  sortOrder: number
  active: boolean
  categoryId?: string
  category?: { id: string; name: string }
}

export interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  active: boolean
  products: MenuProduct[]
}

export interface CreateProductPayload {
  categoryId: string
  name: string
  description?: string
  price: number
  sortOrder?: number
  active?: boolean
}

export type UpdateProductPayload = Partial<CreateProductPayload> & {
  active?: boolean
}

export interface CreateCategoryPayload {
  name: string
  sortOrder?: number
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload> & {
  active?: boolean
}

export async function getCategories(): Promise<MenuCategory[]> {
  const { data } = await api.get<MenuCategory[]>('/categories')
  return data
}

export async function createCategory(
  payload: CreateCategoryPayload,
): Promise<MenuCategory> {
  const { data } = await api.post<MenuCategory>('/categories', payload)
  return data
}

export async function updateCategory(
  id: string,
  payload: UpdateCategoryPayload,
): Promise<MenuCategory> {
  const { data } = await api.patch<MenuCategory>(`/categories/${id}`, payload)
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`)
}

export async function createProduct(
  payload: CreateProductPayload,
): Promise<MenuProduct> {
  const { data } = await api.post<MenuProduct>('/products', payload)
  return data
}

export async function updateProduct(
  id: string,
  payload: UpdateProductPayload,
): Promise<MenuProduct> {
  const { data } = await api.patch<MenuProduct>(`/products/${id}`, payload)
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`)
}

export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED'

export interface RestaurantTable {
  id: string
  number: number
  seats: number
  section: string
  status: TableStatus
  qrToken: string
  ordersCount?: number
  reservationsCount?: number
}

export interface PublicTable {
  id: string
  number: number
  seats: number
  section: string
  status: TableStatus
}

export interface CreateTablePayload {
  number: number
  seats: number
  section?: string
}

export type UpdateTablePayload = Partial<CreateTablePayload>

export async function getTables(): Promise<RestaurantTable[]> {
  const { data } = await api.get<RestaurantTable[]>('/tables')
  return data
}

export async function getTableByToken(token: string): Promise<PublicTable> {
  const { data } = await api.get<PublicTable>(`/tables/by-token/${token}`)
  return data
}

export interface PublicMenuData {
  organizationName: string
  table: PublicTable
  categories: MenuCategory[]
}

export async function getPublicMenuByToken(token: string): Promise<PublicMenuData> {
  const { data } = await api.get<PublicMenuData>(`/public/menu/${token}`)
  return data
}

export async function occupyTableByToken(token: string): Promise<PublicTable> {
  const { data } = await api.post<PublicTable>(`/public/menu/${token}/occupy`)
  return data
}

export interface CreatePublicOrderPayload {
  notes?: string
  items: { productId: string; quantity: number; notes?: string }[]
}

export async function createOrderFromQr(
  token: string,
  payload: CreatePublicOrderPayload,
): Promise<Order> {
  const { data } = await api.post<Order>(`/public/menu/${token}/orders`, payload)
  return data
}

export async function getOrderStatusFromQr(
  token: string,
  customerToken: string,
): Promise<Order> {
  const { data } = await api.get<Order>(
    `/public/menu/${token}/orders/${customerToken}`,
  )
  return data
}

export async function createTable(
  payload: CreateTablePayload,
): Promise<RestaurantTable> {
  const { data } = await api.post<RestaurantTable>('/tables', payload)
  return data
}

export async function updateTable(
  id: string,
  payload: UpdateTablePayload,
): Promise<RestaurantTable> {
  const { data } = await api.patch<RestaurantTable>(`/tables/${id}`, payload)
  return data
}

export async function deleteTable(id: string): Promise<void> {
  await api.delete(`/tables/${id}`)
}

export async function freeTable(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.patch<{ ok: boolean }>(`/tables/${id}/free`)
  return data
}

export type OrderType = 'DINE_IN' | 'TAKEOUT'

export type OrderStatus =
  | 'PENDING'
  | 'IN_PREPARATION'
  | 'READY'
  | 'SERVED'
  | 'PAID'
  | 'CANCELLED'
  | 'AWAITING_CONFIRMATION'

export type PaymentMethod = 'CASH' | 'CARD' | 'YAPE_PLIN'

export interface OrderItem {
  id: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  notes: string | null
}

export interface Order {
  id: string
  folio: number
  orderType: OrderType
  tableId: string | null
  table: { id: string; number: number; section: string } | null
  status: OrderStatus
  notes: string | null
  customerToken?: string
  subtotal: number
  tax: number
  total: number
  createdAt: string
  paidAt: string | null
  items: OrderItem[]
  createdBy?: { id: string; name: string }
  payments?: { id: string; method: PaymentMethod; amount: number; paidAt: string }[]
  statusHistory?: {
    id: string
    status: OrderStatus
    changedAt: string
    changedBy?: { id: string; name: string } | null
  }[]
  statusTimes?: {
    status: OrderStatus
    startedAt: string
    endedAt: string | null
    durationMs: number
  }[]
}

export interface CreateOrderPayload {
  orderType: OrderType
  tableId?: string
  notes?: string
  items: { productId: string; quantity: number; notes?: string }[]
}

export async function getOrders(
  params?: { status?: OrderStatus; tableId?: string },
): Promise<Order[]> {
  const { data } = await api.get<Order[]>('/orders', { params })
  return data
}

export async function getOpenOrdersByTable(tableId: string): Promise<Order[]> {
  const { data } = await api.get<Order[]>(`/orders/open-by-table/${tableId}`)
  return data
}

export async function getOrder(id: string): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${id}`)
  return data
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const { data } = await api.post<Order>('/orders', payload)
  return data
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${id}/status`, { status })
  return data
}

export async function cancelOrder(id: string): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/cancel`)
  return data
}

export async function payOrder(
  id: string,
  method: PaymentMethod,
  applyIgv?: boolean,
): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/pay`, {
    method,
    ...(applyIgv ? { applyIgv } : {}),
  })
  return data
}

export async function addOrderItems(
  id: string,
  dto: { items: Array<{ productId: string; quantity: number; notes?: string }> },
): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${id}/items`, dto)
  return data
}

export type MovementType = 'IN' | 'OUT'

export type LotAlert = 'EXPIRING_SOON' | 'EXPIRED' | null

export interface InventoryLot {
  id: string
  quantity: number
  remaining: number
  receivedAt: string
  expiresAt: string | null
  exitedAt: string | null
  alert: LotAlert
  daysLeft: number | null
}

export type InventoryArea = 'BARRA' | 'COCINA'

export const INVENTORY_AREA_LABEL: Record<InventoryArea, string> = {
  BARRA: 'Barra',
  COCINA: 'Cocina',
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  area: InventoryArea
  stock: number
  minStock: number
  shelfLifeDays: number | null
  active: boolean
  lowStock: boolean
  lots: InventoryLot[]
}

export type InventoryAlertType = 'EXPIRING_SOON' | 'EXPIRED' | 'LOW_STOCK'

export interface InventoryAlert {
  type: InventoryAlertType
  ingredient: {
    id: string
    name: string
    unit: string
    area: InventoryArea
  }
  lot?: { id: string; receivedAt: string; expiresAt: string | null }
  daysLeft: number | null
  stock?: number
  minStock?: number
}

export interface InventoryMovement {
  id: string
  type: MovementType
  quantity: number
  area: InventoryArea
  note: string | null
  createdAt: string
  ingredient: { id: string; name: string; unit: string; area: InventoryArea }
  user: { id: string; name: string }
}

export interface CreateIngredientPayload {
  name: string
  unit: string
  area?: InventoryArea
  minStock?: number
  shelfLifeDays?: number
  active?: boolean
}

export type UpdateIngredientPayload = Partial<CreateIngredientPayload>

export interface CreateEntryPayload {
  quantity: number
  note?: string
  receivedAt?: string
}

export interface CreateExitPayload {
  quantity: number
  note?: string
}

export async function getIngredients(
  area?: InventoryArea,
): Promise<Ingredient[]> {
  const { data } = await api.get<Ingredient[]>('/inventory/ingredients', {
    params: area ? { area } : undefined,
  })
  return data
}

export async function createIngredient(
  payload: CreateIngredientPayload,
): Promise<Ingredient> {
  const { data } = await api.post<Ingredient>('/inventory/ingredients', payload)
  return data
}

export async function updateIngredient(
  id: string,
  payload: UpdateIngredientPayload,
): Promise<Ingredient> {
  const { data } = await api.patch<Ingredient>(
    `/inventory/ingredients/${id}`,
    payload,
  )
  return data
}

export async function deleteIngredient(id: string): Promise<void> {
  await api.delete(`/inventory/ingredients/${id}`)
}

export async function registerEntry(
  id: string,
  payload: CreateEntryPayload,
): Promise<InventoryLot> {
  const { data } = await api.post<InventoryLot>(
    `/inventory/ingredients/${id}/entries`,
    payload,
  )
  return data
}

export async function registerExit(
  id: string,
  payload: CreateExitPayload,
): Promise<void> {
  await api.post(`/inventory/ingredients/${id}/exits`, payload)
}

export async function getInventoryAlerts(): Promise<InventoryAlert[]> {
  const { data } = await api.get<InventoryAlert[]>('/inventory/alerts')
  return data
}

export async function getInventoryMovements(
  area?: InventoryArea,
  ingredientId?: string,
): Promise<InventoryMovement[]> {
  const { data } = await api.get<InventoryMovement[]>('/inventory/movements', {
    params: {
      ...(area ? { area } : {}),
      ...(ingredientId ? { ingredientId } : {}),
    },
  })
  return data
}

export interface UserRole {
  id: string
  name: string
  label: string
}

export interface User {
  id: string
  name: string
  email: string
  active: boolean
  createdAt: string
  role: UserRole
}

export interface Role {
  id: string
  name: string
  label: string
  permissions: { permission: { code: string } }[]
}

export interface CreateUserPayload {
  name: string
  email: string
  password: string
  roleId: string
}

export type UpdateUserPayload = Partial<
  Omit<CreateUserPayload, 'password'> & { password?: string }
>

export async function getUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users')
  return data
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>('/users', payload)
  return data
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, payload)
  return data
}

export async function updateUserStatus(
  id: string,
  active: boolean,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/status`, { active })
  return data
}

export async function getRoles(): Promise<Role[]> {
  const { data } = await api.get<Role[]>('/roles')
  return data
}

export type CashMethod = 'CASH' | 'CARD' | 'YAPE_PLIN'

export interface CashIncomeByMethod {
  method: CashMethod
  amount: number
}

export interface CashExpenseItem {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  incurredAt: string
}

export interface CashSummary {
  incomeByMethod: CashIncomeByMethod[]
  totalIncome: number
  ordersCount: number
  expenses: {
    total: number
    count: number
    items: CashExpenseItem[]
  }
  netIncome: number
  expectedCash: number
  countedCash?: number
  cashDifference?: number
}

export interface CashSession {
  id: string
  openedAt: string
  closedAt: string | null
  openingBalance: number
  openedBy: { id: string; name: string }
  closedBy: { id: string; name: string } | null
  summary: CashSummary
}

export async function getCurrentCashSession(): Promise<CashSession | null> {
  const { data } = await api.get<CashSession | null>('/cash-sessions/current')
  return data
}

export async function getCashSessions(): Promise<CashSession[]> {
  const { data } = await api.get<CashSession[]>('/cash-sessions')
  return data
}

export async function openCashSession(
  openingBalance: number,
): Promise<CashSession> {
  const { data } = await api.post<CashSession>('/cash-sessions/open', {
    openingBalance,
  })
  return data
}

export async function closeCashSession(
  id: string,
  countedCash?: number,
): Promise<CashSession> {
  const { data } = await api.post<CashSession>(`/cash-sessions/${id}/close`, {
    countedCash,
  })
  return data
}

// ---------- Gastos del negocio ----------

export type ExpenseCategory =
  | 'INSUMOS'
  | 'SERVICIOS'
  | 'PERSONAL'
  | 'MANTENIMIENTO'
  | 'TRANSPORTE'
  | 'OTROS'

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  INSUMOS: 'Insumos',
  SERVICIOS: 'Servicios',
  PERSONAL: 'Personal',
  MANTENIMIENTO: 'Mantenimiento',
  TRANSPORTE: 'Transporte',
  OTROS: 'Otros',
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'INSUMOS',
  'SERVICIOS',
  'PERSONAL',
  'MANTENIMIENTO',
  'TRANSPORTE',
  'OTROS',
]

export interface Expense {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  incurredAt: string
  note: string | null
  registeredBy: { id: string; name: string }
  cashSessionId: string | null
  createdAt: string
}

export interface ExpensePayload {
  description: string
  amount: number
  category?: ExpenseCategory
  incurredAt?: string
  note?: string
}

export interface ExpenseFilters {
  from?: string
  to?: string
  category?: ExpenseCategory
}

export async function getExpenses(
  filters: ExpenseFilters = {},
): Promise<Expense[]> {
  const { data } = await api.get<Expense[]>('/expenses', { params: filters })
  return data
}

export async function createExpense(
  payload: ExpensePayload,
): Promise<Expense> {
  const { data } = await api.post<Expense>('/expenses', payload)
  return data
}

export async function updateExpense(
  id: string,
  payload: Partial<ExpensePayload>,
): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}`, payload)
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`)
}

// ---------- Operador del sistema (panel de organizaciones) ----------

export type OrgPlan = 'TRIAL' | 'ACTIVE' | 'PAUSED'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  trialEndsAt: string | null
  maxUsers: number | null
  hasUsersPanelPassword: boolean
  createdAt: string
  usersCount: number
  ordersCount: number
  cashSessionsCount: number
}

export interface CreateOrganizationPayload {
  organizationName: string
  adminName: string
  adminEmail: string
  adminPassword: string
  usersPanelPassword: string
  plan?: OrgPlan
  maxUsers?: number
  trialEndsAt?: string
}

export type UpdateOrganizationPayload = Partial<{
  name: string
  plan: OrgPlan
  maxUsers: number | null
  trialEndsAt: string | null
  usersPanelPassword: string
}>

export async function getOrganizations(): Promise<Organization[]> {
  const { data } = await api.get<Organization[]>('/admin/organizations')
  return data
}

export async function createOrganization(
  payload: CreateOrganizationPayload,
): Promise<Organization> {
  const { data } = await api.post<Organization>('/admin/organizations', payload)
  return data
}

export async function updateOrganization(
  id: string,
  payload: UpdateOrganizationPayload,
): Promise<Organization> {
  const { data } = await api.patch<Organization>(
    `/admin/organizations/${id}`,
    payload,
  )
  return data
}

export async function getOrgUsers(orgId: string): Promise<User[]> {
  const { data } = await api.get<User[]>(`/admin/organizations/${orgId}/users`)
  return data
}

export async function createOrgUser(
  orgId: string,
  payload: CreateUserPayload,
): Promise<User> {
  const { data } = await api.post<User>(
    `/admin/organizations/${orgId}/users`,
    payload,
  )
  return data
}

export async function updateOrgUser(
  orgId: string,
  userId: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await api.patch<User>(
    `/admin/organizations/${orgId}/users/${userId}`,
    payload,
  )
  return data
}

export async function updateOrgUserStatus(
  orgId: string,
  userId: string,
  active: boolean,
): Promise<User> {
  const { data } = await api.patch<User>(
    `/admin/organizations/${orgId}/users/${userId}/status`,
    { active },
  )
  return data
}

// ---------- Organización actual (barra de límite de usuarios) ----------

export interface CurrentOrganization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  trialEndsAt: string | null
  maxUsers: number | null
  usersCount: number
  hasUsersPanelPassword: boolean
}

export async function getCurrentOrganization(): Promise<CurrentOrganization> {
  const { data } = await api.get<CurrentOrganization>('/organizations/current')
  return data
}

export async function verifyUsersPanelPassword(password: string): Promise<void> {
  await api.post('/organizations/users-panel/verify', { password })
}

// ---------- Reportes ----------

export interface ReportRange {
  from: string
  to: string
}

export interface SummaryReport {
  range: ReportRange
  revenue: number
  ordersCount: number
  avgTicket: number
  cancelledCount: number
  cancelledAmount: number
  prevRevenue: number
  revenueDeltaPct: number | null
  prevOrdersCount: number
  avgTicketDeltaPct: number | null
  byPaymentMethod: { method: PaymentMethod; amount: number; count: number }[]
  byOrderType: { type: OrderType; amount: number; count: number }[]
}

export interface SalesTrendReport {
  range: ReportRange
  granularity: 'day' | 'week' | 'month'
  series: { period: string; revenue: number; orders: number }[]
  byDayOfWeek: { day: number; revenue: number; orders: number }[]
  byHour: { hour: number; revenue: number; orders: number }[]
}

export interface TopProductsReport {
  range: ReportRange
  top: {
    productId: string | null
    productName: string
    category: string
    quantity: number
    revenue: number
  }[]
  bottom: {
    productId: string | null
    productName: string
    category: string
    quantity: number
    revenue: number
  }[]
  byCategory: {
    category: string
    quantity: number
    revenue: number
    share: number
  }[]
}

export interface ServiceReport {
  range: ReportRange
  serviceTimes: {
    avgKitchenMs: number | null
    avgTotalMs: number | null
  }
  byWaiter: {
    userId: string | null
    name: string
    orders: number
    revenue: number
  }[]
  tables: {
    total: number
    occupied: number
    utilization: number
    avgOrdersPerTable: number
    avgDineInDurationMs: number | null
    ranking: { number: number; section: string; orders: number; revenue: number }[]
  }
}

export interface CashReport {
  range: ReportRange
  sessions: {
    id: string
    openedAt: string
    closedAt: string | null
    openedBy: { id: string; name: string }
    closedBy: { id: string; name: string } | null
    openingBalance: number
    cash: number
    card: number
    yape: number
    total: number
    expenses: number
    netResult: number
    ordersCount: number
    expectedCash: number
  }[]
  totals: {
    income: number
    expenses: number
    expensesCount: number
    netResult: number
    sessionsCount: number
  }
  expensesByCategory: { category: ExpenseCategory; amount: number; count: number }[]
}

export interface InventoryReport {
  range: ReportRange
  consumption: {
    ingredientId: string
    name: string
    unit: string
    quantity: number
  }[]
  lowStock: { name: string; unit: string; stock: number; minStock: number }[]
  expiring: {
    soon: {
      ingredientId: string
      ingredientName: string
      unit: string
      remaining: number
      expiresAt: string | null
    }[]
    expired: {
      ingredientId: string
      ingredientName: string
      unit: string
      remaining: number
      expiresAt: string | null
    }[]
  }
}

export interface ReportsParams {
  from?: string
  to?: string
}

export async function getReportSummary(
  params?: ReportsParams,
): Promise<SummaryReport> {
  const { data } = await api.get<SummaryReport>('/reports/summary', { params })
  return data
}

export async function getReportSalesTrend(
  params?: ReportsParams & { granularity?: 'day' | 'week' | 'month' },
): Promise<SalesTrendReport> {
  const { data } = await api.get<SalesTrendReport>('/reports/sales-trend', {
    params,
  })
  return data
}

export async function getReportTopProducts(
  params?: ReportsParams & { limit?: number },
): Promise<TopProductsReport> {
  const { data } = await api.get<TopProductsReport>('/reports/top-products', {
    params,
  })
  return data
}

export async function getReportService(
  params?: ReportsParams,
): Promise<ServiceReport> {
  const { data } = await api.get<ServiceReport>('/reports/service', { params })
  return data
}

export async function getReportCash(
  params?: ReportsParams,
): Promise<CashReport> {
  const { data } = await api.get<CashReport>('/reports/cash-sessions', {
    params,
  })
  return data
}

export async function getReportInventory(
  params?: ReportsParams,
): Promise<InventoryReport> {
  const { data } = await api.get<InventoryReport>('/reports/inventory', {
    params,
  })
  return data
}

export async function downloadReportsExcel(
  params?: ReportsParams,
): Promise<void> {
  const response = await api.get<Blob>('/reports/export', {
    params,
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `reporte-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
