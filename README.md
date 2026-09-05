# RestobarService

Sistema de gestión para restaurante: comandas (POS), cocina, carta por QR, mesas, inventario, reservaciones y reportes.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript, Tailwind CSS v4 + shadcn/ui, React Router, TanStack Query, Zustand |
| Backend | NestJS 11 + TypeScript |
| Base de datos | PostgreSQL |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |

## Estructura

```
restobar-service/
├─ server/   # API NestJS (puerto 3000)
├─ client/   # SPA React (puerto 5173)
└─ .gitignore
```

## Requisitos

- Node.js 24+
- PostgreSQL 16+ corriendo localmente (el servicio en Windows usa la 18)

## Configuración inicial

1. Crear la base de datos y el usuario (una vez):

   ```sql
   CREATE ROLE restobar_app LOGIN PASSWORD 'tu-contrasena';
   CREATE DATABASE restobar OWNER restobar_app;
   ```

2. Configurar variables de entorno:

   - `server/.env` (ver `server/.env.example`):

     ```
     DATABASE_URL="postgresql://restobar_app:tu-contrasena@localhost:5432/restobar?schema=public"
     JWT_SECRET="cambiar-esta-secreta-en-produccion"
     PORT=3000
     ```

3. Instalar dependencias:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

4. Aplicar migraciones y sembrar datos iniciales:

   ```bash
   cd server
   npx prisma migrate deploy
   npm run prisma:seed
   ```

   El seed crea: roles y permisos (RBAC), usuario administrador (`admin@restobar.mx` / `admin123`), usuarios demo por rol, 4 categorías con 14 productos, 10 mesas con QR e ingredientes de demostración con lotes y caducidad.

## Arranque (desarrollo)

Terminal 1 — API:

```bash
cd server
npm run start:dev
```

Terminal 2 — Frontend (el proxy de Vite reenvía `/api` al puerto 3000):

```bash
cd client
npm run dev
```

Verificar estado: http://localhost:5173/api/health debe responder `{"status":"ok","database":"ok"}`.

## Autenticación (JWT + RBAC)

- `POST /api/auth/login` — `{ email, password }` → `{ accessToken, user }` (público)
- `GET /api/auth/me` — datos del usuario autenticado (requiere token)
- `GET /api/users` y `POST /api/users` — solo `users:manage` (ADMIN)

Todos los endpoints exigen token `Authorization: Bearer <token>` salvo los marcados `@Public()`. Los permisos se validan con guards globales: `JwtAuthGuard` + `PermissionsGuard`; el decorador `@RequirePermissions('modulo:accion')` restringe por permiso.

Usuarios seed:

| Rol | Correo | Contraseña |
|---|---|---|
| ADMIN | `admin@restobar.mx` | `admin123` |
| GERENTE (demo) | `gerente@restobar.mx` | `gerente123` |
| MESERO (demo) | `mesero@restobar.mx` | `mesero123` |
| COCINA (demo) | `cocina@restobar.mx` | `cocina123` |
| CAJA (demo) | `caja@restobar.mx` | `caja123` |

Frontend: el token y el usuario se guardan en localStorage (zustand persist); la página `/login` los usa y `/app/*` es zona protegida por rol/permiso.

## Menú (categorías y productos)

- `GET /api/categories` — categorías con sus productos (público, lo usará la carta por QR)
- `GET /api/products` — todos los productos (público)
- `POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id` — solo `menu:manage`
- `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` — solo `menu:manage`

Reglas de negocio: no se puede eliminar una categoría que tenga productos (respuesta 400); los precios son `Decimal` y se devuelven como número; los campos `active` controlan disponibilidad en la carta. El frontend gestiona todo desde `/app/menu`.

## Mesas y QR

- `GET /api/tables` — mesas con conteos de órdenes y reservas (requiere sesión)
- `GET /api/tables/by-token/:qrToken` — datos de la mesa por su token (público, lo usa la carta)
- `POST /api/tables`, `PATCH /api/tables/:id`, `DELETE /api/tables/:id` — solo `tables:manage` (409 si el número ya existe; no se elimina una mesa con órdenes)

El `qrToken` se genera automáticamente al crear la mesa. El frontend (`/app/tables`) muestra el QR que apunta a `/menu/:qrToken` (ruta pública, sin login) con la carta del restaurante filtrada por mesa (sección e información).

## Comandas (POS)

- `POST /api/orders` — crea una comanda (`orders:create`). Cuerpo: `{ orderType: "DINE_IN" | "TAKEOUT", tableId?, notes?, items: [{ productId, quantity, notes? }] }`. Los precios se congelan al ordenar (snapshot del nombre y precio), se calcula subtotal + IVA (16%) + total con precisión de centavos y la mesa queda `OCCUPIED`.
- `GET /api/orders?status=&tableId=` — lista de comandas (visible para mesero, cocina, caja y admin).
- `GET /api/orders/open-by-table/:tableId` — comandas abiertas de una mesa (para continuar o cobrar desde el POS).
- `GET /api/orders/:id` — detalle con items, pagos e historial de estados.
- `PATCH /api/orders/:id/status` — transición de estado (`orders:update`). Flujo: `PENDING → IN_PREPARATION → READY → SERVED`; `PAID` solo vía cobro y `CANCELLED` solo vía cancelación. Transiciones inválidas → 400.
- `POST /api/orders/:id/cancel` — cancela (`orders:cancel`) y libera la mesa.
- `POST /api/orders/:id/pay` — cobra (`orders:pay`) con `{ method: "CASH" | "CARD" }`; crea el pago con el total, marca `PAID`, guarda `paidAt` y libera la mesa.

Cada cambio de estado se registra en `OrderStatusHistory`. La UI vive en `/app/pos` (Punto de venta): selección de mesa o «para llevar», catálogo por categorías con solo productos activos, ticket con cantidades y notas, totales con IVA, órdenes activas con acciones según el rol (marcar servida, cobrar, cancelar) y diálogo de cobro con método de pago.

## Inventario

Módulo de almacén con ingredientes, lotes con caducidad y alertas. Sin recetas por ahora; las reservaciones también están pendientes (los modelos quedan en el schema para una futura implementación).

- `GET /api/inventory/ingredients` — ingredientes con su stock, mínimo, vida útil y lotes (cada lote con fecha de ingreso, caducidad, disponible y estado de alerta).
- `POST /api/inventory/ingredients`, `PATCH /api/inventory/ingredients/:id`, `DELETE /api/inventory/ingredients/:id` — alta/edición/baja (`inventory:manage`). No se elimina un ingrediente con movimientos (409); en su lugar se desactiva.
- `POST /api/inventory/ingredients/:id/entries` — registra una **carga**: crea un lote con fecha de ingreso (`receivedAt`, opcional, por defecto hoy) y **caducidad = ingreso + vida útil** (si el ingrediente tiene `shelfLifeDays`); suma al stock.
- `POST /api/inventory/ingredients/:id/exits` — registra una **salida** consumiendo primero los lotes que caducan antes (FEFO); resta del stock y marca la fecha de salida (`exitedAt`) cuando un lote se agota. Stock insuficiente → 400.
- `GET /api/inventory/alerts` — alertas: lotes **caducados**, lotes que **caducan en 2 días o menos** y **stock bajo** (stock < mínimo).
- `GET /api/inventory/movements` — historial de entradas/salidas con usuario y nota.

Todo el módulo requiere `inventory:manage` (ADMIN y GERENTE). La pantalla `/app/inventory` muestra los ingredientes como tarjetas con sus lotes, un banner de alertas de caducidad, y la tabla de movimientos recientes.

## Reportes

Módulo de análisis para ADMIN y GERENTE (`reports:view`) en `/app/reports`. Todos los endpoints aceptan `from`/`to` (YYYY-MM-DD o ISO) y por defecto cubren los últimos 30 días.

- `GET /api/reports/summary` — ingresos, nº de pedidos, ticket promedio, cancelaciones, comparativa con el período anterior y desglose por método de pago y tipo de pedido.
- `GET /api/reports/sales-trend` — evolución de ventas por día/semana/mes (`granularity`), más el reparto por día de la semana y por hora.
- `GET /api/reports/top-products` — platillos más y menos vendidos por ingresos (`limit`, máximo 100) y ventas por categoría con participación.
- `GET /api/reports/service` — tiempos promedio de cocina y hasta servido, ventas por mesero, ocupación de mesas, pedidos promedio por mesa y ranking de mesas.
- `GET /api/reports/cash-sessions` — cierres de caja del período con efectivo, tarjeta, Yape/Plin, total y efectivo esperado.
- `GET /api/reports/inventory` — consumo de insumos, stock bajo el mínimo y lotes por vencer (30 días) o vencidos.
- `GET /api/reports/export` — descarga un Excel (`.xlsx`) con una hoja por cada reporte anterior.

La pantalla de reportes del frontend agrupa todo en pestañas (Resumen, Ventas, Productos, Servicio, Caja, Inventario) con presets de período (hoy, ayer, 7/30 días, este mes o personalizado), gráficas con Recharts y botón de exportación a Excel.

## Reservaciones (pendiente)

La estructura de datos (mesa, cliente, fecha, comensales, estado `PENDING / CONFIRMED / CANCELLED / COMPLETED / NO_SHOW`) ya existe en `Reservation`, pero el módulo aún no se implementa.

## Scripts útiles

En `server/`:

- `npm run start:dev` — API con watch
- `npm run build` — compilar a `dist/`
- `npm run prisma:seed` — sembrar datos iniciales
- `npm run prisma:migrate` — nueva migración (interactivo)
- `npm run prisma:studio` — explorar la base con Prisma Studio

En `client/`:

- `npm run dev` — dev server de Vite
- `npm run build` — build de producción
- `npm run lint` — oxlint
- `npm run test` — tests unitarios con Vitest
- `npm run test:watch` — Vitest en modo watch

## Pruebas unitarias

- **Servidor (Jest + ts-jest):** `cd server && npm run test`. Cubren los servicios de auth, usuarios, categorías, productos, mesas, órdenes, inventario y reportes (login exitoso/fallido/deshabilitado, normalización de correos, conflictos de unicidad → 409, eliminaciones protegidas, generación de QR, creación de comandas con snapshots e IVA, transiciones de estado, cancelación y cobro, caducidad de lotes con alertas, entradas/salidas FEFO y stock insuficiente, resúmenes y tendencias de ventas, productos top, tiempos de servicio, cierres de caja, inventario y exportación a Excel). Los tests no tocan la base de datos (PrismaService mockeado mediante `test/prisma-client.mock.ts`, que evita cargar el cliente generado).
- **Cliente (Vitest):** `cd client && npm run test`. Cubren utilidades puras: `cn` (tailwind-merge), `formatCurrency`, `getApiErrorMessage` y el cálculo de totales del carrito (`computeTotals` con precisión de centavos e IVA).

## Seguridad y robustez

- Emails normalizados (trim + minúsculas) al hacer login o crear usuarios; login con tiempo de respuesta consistente (bcrypt con hash ficticio) para evitar enumeración de usuarios.
- Rate limiting: 5 intentos/minuto en `POST /auth/login` y 60 peticiones/minuto global (429).
- Validación estricta de entrada: `forbidNonWhitelisted` rechaza campos desconocidos, `ParseUUIDPipe` valida los IDs de ruta y todos los campos tienen límites de longitud.
- Conflictos de unicidad manejados como HTTP 409 (categorías, productos, mesas, usuarios, ingredientes) en lugar de errores 500.
- En producción se exige `JWT_SECRET` configurado (arranque falla si falta).
- Contraseñas con bcrypt (coste 10); `passwordHash` nunca se expone en respuestas.
- El frontend es totalmente responsive (sidebar de escritorio + drawer móvil, diálogos y grids adaptables) y envuelve la app en un `ErrorBoundary` para evitar pantallas en blanco.

## Notas técnicas

- Prisma 7 genera el cliente TS en `server/generated/prisma` (con `moduleFormat = "cjs"` para CommonJS). No se sube al repo.
- La importación del cliente generado desde `src/` es `../../generated/prisma/client`.
- `prisma migrate dev` no funciona en terminal no interactiva; usar `--create-only` + `prisma migrate deploy`, o generar el SQL con `prisma migrate diff` y aplicar con `prisma migrate deploy`.
