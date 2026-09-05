# Pruebas unitarias — RestobarService

Documento de referencia de todos los tests unitarios del proyecto. Total: **149 tests** (127 servidor + 22 cliente) en **15 suites** (11 servidor + 4 cliente).

## Ejecución

| Ámbito | Comando | Framework | Resultado esperado |
|---|---|---|---|
| Servidor | `cd server && npm run test` | Jest + ts-jest | 11 suites, 127 tests |
| Servidor (solo un archivo) | `cd server && npx jest src/<modulo>/<archivo>.spec.ts` | Jest | — |
| Cliente | `cd client && npm run test` | Vitest | 4 suites, 22 tests |
| Cliente (watch) | `cd client && npm run test:watch` | Vitest | — |

## Estrategia de mocks

- **Servidor:** ningún test toca la base de datos. El `PrismaService` se sustituye por un objeto con métodos `jest.fn()` por modelo; las transacciones (`$transaction`) se simulan con un `tx` que delega en los mismos mocks. El cliente Prisma generado se evita mediante `server/test/prisma-client.mock.ts` (shim de `Prisma` y `PrismaClient`). `bcryptjs` se mockea en los specs de usuarios y organizaciones para no hashear de verdad.
- **Cliente:** se prueban solo utilidades puras (sin componentes ni red). `Vitest` en modo `node`.

---

# Servidor — Jest

## 1. `src/app.controller.spec.ts` — AppController (1 test)

| Describe | Test |
|---|---|
| `root` | `getHello` devuelve `"Hello World!"` |

---

## 2. `src/auth/auth.service.spec.ts` — AuthService (9 tests)

### `login`
| Test | Verifica |
|---|---|
| Devuelve token y usuario para credenciales correctas | Normaliza el email a minúsculas, firma JWT, devuelve permisos del rol |
| Lanza `UnauthorizedException` con contraseña incorrecta | Bcrypt no coincide → 401 |
| Lanza `UnauthorizedException` si el usuario no existe | Usuario no encontrado → 401 |
| Lanza `UnauthorizedException` si el usuario está inactivo | `active: false` → 401 |

### `me`
| Test | Verifica |
|---|---|
| Devuelve el usuario autenticado | Trae el usuario con su rol |
| Lanza `UnauthorizedException` si el usuario no existe | → 401 |
| Lanza `UnauthorizedException` si el usuario está inactivo | → 401 |

### `register`
| Test | Verifica |
|---|---|
| Crea la org en TRIAL con límite por defecto y el admin | Recorta nombre/org/email, genera slug único, `plan: TRIAL`, `maxUsers: 5`, crea usuario ADMIN, firma token |
| Lanza `ConflictException` si el correo ya está registrado | Email duplicado → 409 |

---

## 3. `src/users/users.service.spec.ts` — UsersService (17 tests)

### `create`
| Test | Verifica |
|---|---|
| Normaliza email y nombre, hashea la contraseña y liga a la organización | Trim en `name`/`email`, `passwordHash`, `organizationId` |
| Lanza `ConflictException` si el correo ya existe | → 409 |
| Lanza `BadRequestException` si el rol no existe | Rol inválido → 400 |

### `límite de usuarios`
| Test | Verifica |
|---|---|
| Bloquea la creación cuando la org alcanza su límite | `usersCount >= maxUsers` → 409 |
| Permite crear mientras haya espacio en el límite | Hay cupo → crea |
| No aplica límite si `maxUsers` es null (ilimitado) | Sin límite → crea |
| Bloquea reactivar un usuario cuando la org está al límite | Reactivación sin cupo → 409 |

### `findAll`
| Test | Verifica |
|---|---|
| No expone `passwordHash` y filtra por organización | `select` sin `passwordHash`, `where.organizationId` |

### `update`
| Test | Verifica |
|---|---|
| Lanza `NotFoundException` si el usuario no existe o es de otra organización | → 404 |
| Lanza `ConflictException` si el correo ya está en uso por otro usuario | Email duplicado → 409 |
| Rechaza cambiar tu propio rol | `actorId === userId` con cambio de rol → 400 |
| Rechaza quitar el rol de administrador al último admin activo de la org | Quedaría 0 admins activos → 400 |
| Actualiza datos y hashea la nueva contraseña | Trim de nombre, re-hash si viene `password` |

### `updateStatus`
| Test | Verifica |
|---|---|
| Lanza `NotFoundException` si no existe | → 404 |
| Rechaza desactivar tu propia cuenta | → 400 |
| Rechaza desactivar al último administrador activo | → 400 |
| Permite desactivar si hay otro admin activo | Cuenta admins activos > 1 → desactiva |

---

## 4. `src/menu/categories.service.spec.ts` — CategoriesService (12 tests)

### `findAll`
| Test | Verifica |
|---|---|
| Convierte los precios de producto a número y filtra por organización | `Decimal` → `number`, `where.organizationId` |
| Ordena por `sortOrder` y luego nombre | `orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]` |

### `create`
| Test | Verifica |
|---|---|
| Crea la categoría recortando espacios y ligada a la organización | Trim de nombre, `organizationId` |
| Usa `sortOrder` 0 si no se envía | Valor por defecto |
| Lanza `ConflictException` si el nombre ya existe | Error P2002 → 409 |

### `update`
| Test | Verifica |
|---|---|
| Actualiza nombre, orden y estado | Trim + campos |
| Lanza `NotFoundException` si no existe | → 404 |
| Lanza `NotFoundException` si pertenece a otra organización | Scoping → 404 |
| Lanza `ConflictException` si el nombre nuevo ya existe | P2002 → 409 |

### `remove`
| Test | Verifica |
|---|---|
| Lanza `BadRequestException` si tiene productos | `_count.products > 0` → 400, no borra |
| Elimina la categoría vacía | Devuelve `{ ok: true }` |
| Lanza `NotFoundException` si no existe | → 404 |

---

## 5. `src/menu/products.service.spec.ts` — ProductsService (10 tests)

### `findAll`
| Test | Verifica |
|---|---|
| Convierte el precio a número y filtra por organización | `Decimal` → `number`, scoping |

### `create`
| Test | Verifica |
|---|---|
| Lanza `BadRequestException` si la categoría no existe | → 400, no crea |
| Lanza `BadRequestException` si la categoría es de otra organización | Scoping → 400 |
| Crea el producto con nombre recortado, activo por defecto y de la organización | `active: true`, `description: null`, `organizationId` |
| Lanza `ConflictException` si ya existe el nombre en la categoría | P2002 → 409 |

### `update`
| Test | Verifica |
|---|---|
| Lanza `NotFoundException` si el producto no existe | → 404 |
| Lanza `BadRequestException` si se mueve a una categoría inexistente | → 400 |
| Actualiza el producto | Trim de nombre + campos |

### `remove`
| Test | Verifica |
|---|---|
| Elimina el producto | Devuelve `{ ok: true }` |
| Lanza `NotFoundException` si no existe | → 404 |

---

## 6. `src/tables/tables.service.spec.ts` — TablesService (12 tests)

### `findAll`
| Test | Verifica |
|---|---|
| Devuelve mesas ordenadas, scoped por organización y sin datos sensibles | `orderBy: { number: 'asc' }`, mapea `ordersCount` / `reservationsCount` |

### `findByToken`
| Test | Verifica |
|---|---|
| Devuelve la mesa sin exponer el token | `qrToken` no se incluye en la respuesta |
| Lanza `NotFoundException` si el token no existe | → 404 |

### `create`
| Test | Verifica |
|---|---|
| Genera un `qrToken` de 16 caracteres hex y liga la mesa a la organización | Formato `/^[0-9a-f]{16}$/`, sección por defecto `Interior`, `organizationId` |
| Usa la sección proporcionada | Sección enviada prevalece |
| Lanza `ConflictException` si el número ya existe | P2002 → 409 |

### `update`
| Test | Verifica |
|---|---|
| Lanza `NotFoundException` si la mesa no existe o es de otra organización | → 404 |
| Actualiza los datos de la mesa | Campos enviados |
| Lanza `ConflictException` si el número nuevo ya existe | P2002 → 409 |

### `remove`
| Test | Verifica |
|---|---|
| Lanza `BadRequestException` si la mesa tiene órdenes | `_count.orders > 0` → 400, no borra |
| Elimina la mesa sin órdenes | Devuelve `{ ok: true }` |
| Lanza `NotFoundException` si no existe | → 404 |

---

## 7. `src/orders/orders.service.spec.ts` — OrdersService (18 tests)

### `create`
| Test | Verifica |
|---|---|
| Requiere mesa para comandas de mesa | `DINE_IN` sin `tableId` → 400 |
| Rechaza mesa en comandas para llevar | `TAKEOUT` con `tableId` → 400 |
| Valida que los productos existan | Producto inexistente → 400 |
| Valida que la mesa exista | Mesa inexistente → 400 |
| Crea la orden con snapshots, IVA y totales; marca la mesa ocupada | Snapshot de nombre/precio, subtotal 325 + IVA 52 = total 377, trim de notas, mesa → `OCCUPIED` |
| No marca mesa ocupada en comandas para llevar | Sin `restaurantTable.update` |

### `findAll` / `findOne`
| Test | Verifica |
|---|---|
| Serializa precios a número | `subtotal`/`tax`/`total`/`unitPrice` → `number` |
| Lanza `NotFound` si la orden no existe | → 404 |
| Calcula el tiempo que la orden pasó en cada estado | `statusTimes` con `durationMs`/`endedAt`, último estado abierto con `endedAt: null` |

### `updateStatus`
| Test | Verifica |
|---|---|
| Lanza `NotFound` si no existe | → 404 |
| Rechaza transiciones inválidas | Ej. `PENDING → SERVED` → 400 |
| Avanza `PENDING → IN_PREPARATION` y registra el historial | Actualiza estado y crea `OrderStatusHistory` con `changedById` |
| No permite modificar órdenes pagadas | `PAID` → 400 |

### `cancel`
| Test | Verifica |
|---|---|
| Cancela, libera la mesa y registra el historial | Mesa → `FREE`, historial `CANCELLED` |
| No cancela órdenes pagadas | `PAID` → 400 |

### `pay`
| Test | Verifica |
|---|---|
| Cobra, crea el pago con el total y libera la mesa | Crea `Payment` con `amount` = total y método, mesa → `FREE`, `paidAt` |
| No cobra una orden ya pagada ni cancelada | `PAID` y `CANCELLED` → 400 |

### `findOpenByTable`
| Test | Verifica |
|---|---|
| Busca solo órdenes abiertas de la mesa | Filtra por `tableId` + `organizationId` + estados abiertos (PENDING…SERVED, AWAITING_CONFIRMATION) |

---

## 8. `src/inventory/inventory.service.spec.ts` — InventoryService (15 tests)

### `findIngredients`
| Test | Verifica |
|---|---|
| Convierte stock y calcula `lowStock` y alertas de lote | `stock` → `number`, `lowStock` si stock < mínimo, lotes agotados sin alerta, `daysLeft` |
| Marca `EXPIRING_SOON` cuando faltan 2 días o menos y `EXPIRED` al vencer | Umbrales de alerta por caducidad |

### `createIngredient`
| Test | Verifica |
|---|---|
| Crea con nombre recortado y valores por defecto | Trim, `minStock: 0`, `shelfLifeDays: null`, `active: true` |
| Lanza `ConflictException` si ya existe el nombre | P2002 → 409 |

### `updateIngredient`
| Test | Verifica |
|---|---|
| Lanza `NotFoundException` si no existe | → 404, scoping por organización |

### `removeIngredient`
| Test | Verifica |
|---|---|
| Lanza `ConflictException` si tiene movimientos (P2003) | FK restringida → 409 |
| Elimina sin movimientos | Devuelve `{ ok: true }` |

### `registerEntry`
| Test | Verifica |
|---|---|
| Crea el lote con caducidad = ingreso + `shelfLifeDays` y suma stock | `expiresAt` calculado, `stock: { increment }`, crea movimiento `IN` con usuario |
| Sin `shelfLifeDays` no calcula caducidad | `expiresAt: null` |
| Rechaza una fecha de ingreso futura | → 400 |

### `registerExit`
| Test | Verifica |
|---|---|
| Rechaza si el stock es insuficiente | → 400 |
| Consume primero el lote que caduca antes (FEFO) y registra salida | Agota lote próximo a vencer (`exitedAt`), resta del otro, decrementa stock, 2 movimientos `OUT` |
| Lanza `NotFoundException` si el ingrediente no existe | → 404 |

### `getAlerts`
| Test | Verifica |
|---|---|
| Devuelve alertas ordenadas: caducados, por caducar y stock bajo | Orden `EXPIRED` → `EXPIRING_SOON` → `LOW_STOCK` |

### `findMovements`
| Test | Verifica |
|---|---|
| Serializa cantidades a número | `quantity` → `number`, scoping |

---

## 9. `src/cash/cash.service.spec.ts` — CashService (8 tests)

### `getCurrent`
| Test | Verifica |
|---|---|
| Devuelve null si no hay caja abierta | Sin sesión `closedAt: null` → `null` |
| Devuelve la caja abierta con el resumen en vivo por método | Suma pagos por método (`CASH`/`CARD`/`YAPE_PLIN`), `totalIncome`, `expectedCash` = caja chica + efectivo |

### `getHistory`
| Test | Verifica |
|---|---|
| Usa el snapshot para cierres y resumen en vivo para la abierta | Sesión cerrada usa `closing*`, abierta calcula en vivo |

### `open`
| Test | Verifica |
|---|---|
| Abre la caja con la caja chica y resumen en ceros | `openingBalance`, resumen en ceros, `openedById` |
| Lanza error si ya hay una caja abierta | → `BadRequestException`, no crea |

### `close`
| Test | Verifica |
|---|---|
| Lanza `NotFound` si la sesión no existe | → 404 |
| Lanza error si la caja ya está cerrada | → 400, no actualiza |
| Guarda el snapshot de totales y devuelve el resumen | Persiste `closingCash/Card/Yape`, `ordersCount`, `closedById`, resumen |

---

## 10. `src/organizations/organizations.service.spec.ts` — OrganizationsService (9 tests)

### `findAll`
| Test | Verifica |
|---|---|
| Mapea conteos y `maxUsers` | `usersCount`, `ordersCount`, `cashSessionsCount`, `hasUsersPanelPassword` |

### `getCurrent`
| Test | Verifica |
|---|---|
| Devuelve datos de la org | Conteo de usuarios y si tiene contraseña de panel |
| Lanza `NotFoundException` si la org no existe | → 404 |

### `createAdminOrg`
| Test | Verifica |
|---|---|
| Crea org con slug, límite por defecto y hash del panel, y al admin | Recorta campos, `maxUsers: 5`, hash de contraseña del panel, crea admin |
| Lanza `ConflictException` si el correo del admin ya existe | → 409 |

### `update`
| Test | Verifica |
|---|---|
| Actualiza plan, límite y resetea la contraseña del panel | Campos + re-hash si viene contraseña nueva |
| Lanza `NotFoundException` si la org no existe | → 404 |

### `verifyUsersPanelPassword`
| Test | Verifica |
|---|---|
| Devuelve true con contraseña correcta | `bcrypt.compare` verdadero |
| Devuelve false si la org no tiene contraseña configurada | Sin hash → `false` |

---

## 11. `src/reports/reports.service.spec.ts` — ReportsService (16 tests)

### `summary`
| Test | Verifica |
|---|---|
| Calcula ingresos, ticket promedio, desgloses y variación | Ingresos 972, ticket 486, desglose por método y tipo de pedido, variación vs período anterior (94.4%) |
| Incluye cancelados y devuelve delta null sin período anterior | `cancelledCount`/`cancelledAmount`, `revenueDeltaPct: null` |
| Filtra por rango en los pedidos pagados y pagos | `paidAt` con `gte`/`lte`, scoping por org |
| Lanza error con rango inválido | Fecha inválida → 400 |
| Lanza error si el inicio es posterior al fin | `to < from` → 400, no consulta |

### `salesTrend`
| Test | Verifica |
|---|---|
| Agrupa por día, día de la semana y hora | Serie por período, `byDayOfWeek`, `byHour` |
| Agrupa por mes cuando se pide granularidad mensual | Claves `YYYY-MM` |
| Devuelve series vacías sin ventas | Sin datos → series y arreglos de 7/24 listos |

### `topProducts`
| Test | Verifica |
|---|---|
| Agrega por producto, calcula ingresos y ordena por recaudación | Productos manuales (`productId: null`), empates resueltos por cantidad, `bottom`, categorías con `share` |
| Respeta el límite solicitado | `limit` acota `top` |

### `serviceReport`
| Test | Verifica |
|---|---|
| Calcula tiempos, por mesero y ranking de mesas | Tiempo de cocina (PENDING→READY), hasta servido, ventas por mesero, ocupación, ranking de mesas |
| Devuelve nulos de tiempo sin historial suficiente | Sin estados → tiempos `null`, mesero `'Sin mesero'` |

### `cashReport`
| Test | Verifica |
|---|---|
| Mapea los cierres con snapshot de totales | `openingBalance`, `cash`/`card`/`yape`, `total`, `ordersCount`, `expectedCash`; sesión abierta con ceros |

### `inventoryReport`
| Test | Verifica |
|---|---|
| Calcula consumo, stock bajo y lotes por vencer | Consumo agregado por insumo, `lowStock` bajo el mínimo, lotes por vencer/vencidos |
| Devuelve listas vacías sin movimientos ni alertas | Sin datos → arreglos vacíos |

### `export`
| Test | Verifica |
|---|---|
| Genera un libro de Excel con todas las hojas | Buffer válido de XLSX (cabecera ZIP `PK`) y tamaño > 1 KB |

---

# Cliente — Vitest

## 12. `src/lib/cart.test.ts` — carrito del POS (6 tests)

### `computeTotals`
| Test | Verifica |
|---|---|
| Calcula subtotal, IVA y total con precisión de centavos | 325 + 52 (16%) = 377, `itemCount` |
| Es centavo-exacto con precios decimales | Evita errores de coma flotante (0.1×3 + 19.99×2) |
| Usa la tasa de IVA definida | `TAX_RATE === 0.16` |
| Devuelve ceros para un carrito vacío | Todos los totales en 0 |

### `mergeLines`
| Test | Verifica |
|---|---|
| Agrega una línea nueva con cantidad 1 por defecto | Producto nuevo |
| Incrementa la cantidad si el producto ya está | Mismo `productId` suma cantidad |

---

## 13. `src/lib/format.test.ts` — formato de moneda y duración (8 tests)

### `formatCurrency`
| Test | Verifica |
|---|---|
| Formatea números enteros con dos decimales | `145` → contiene `145` y `.00` y `S/` |
| Formatea valores con decimales | `12.50` |
| Formatea cero | Contiene `0` |
| No revienta con NaN o Infinity | Devuelve `0` |

### `formatDuration`
| Test | Verifica |
|---|---|
| Formatea segundos | `5s`, `0s` |
| Formatea minutos y segundos | `125000ms` → `2m 05s` |
| Formatea horas y minutos | `3661000ms` → `1h 01m` |
| Tolera NaN o negativos | Devuelve `0s` |

---

## 14. `src/lib/utils.test.ts` — `cn` (4 tests)

| Test | Verifica |
|---|---|
| Une clases simples | `cn('a','b')` → `'a b'` |
| Ignora valores falsy | Filtra `false`, `null`, `undefined`, `0`, `''` |
| Soporta objetos clsx | Objetos con claves booleanas |
| Resuelve conflictos con tailwind-merge | `px-2` + `px-4` → `px-4` |

---

## 15. `src/lib/errors.test.ts` — `getApiErrorMessage` (4 tests)

| Test | Verifica |
|---|---|
| Devuelve el mensaje de una respuesta de error | `message` de la respuesta |
| Une los mensajes de validación en array | Array → cadena separada por comas |
| Devuelve mensaje genérico si la respuesta no trae datos | `'Ocurrió un error inesperado'` |
| Devuelve mensaje genérico para errores que no son de axios | Errores comunes, strings y `undefined` |

---

# Resumen por módulo

| Ámbito | Módulo | Suites | Tests |
|---|---|---|---|
| Servidor | App | `app.controller.spec.ts` | 1 |
| Servidor | Auth | `auth.service.spec.ts` | 9 |
| Servidor | Usuarios | `users.service.spec.ts` | 17 |
| Servidor | Menú — categorías | `categories.service.spec.ts` | 12 |
| Servidor | Menú — productos | `products.service.spec.ts` | 10 |
| Servidor | Mesas | `tables.service.spec.ts` | 12 |
| Servidor | Órdenes | `orders.service.spec.ts` | 18 |
| Servidor | Inventario | `inventory.service.spec.ts` | 15 |
| Servidor | Caja | `cash.service.spec.ts` | 8 |
| Servidor | Organizaciones | `organizations.service.spec.ts` | 9 |
| Servidor | Reportes | `reports.service.spec.ts` | 16 |
| Cliente | Carrito | `cart.test.ts` | 6 |
| Cliente | Formato | `format.test.ts` | 8 |
| Cliente | Utilidades | `utils.test.ts` | 4 |
| Cliente | Errores | `errors.test.ts` | 4 |
| **Total** | | **15 suites** | **149 tests** |
