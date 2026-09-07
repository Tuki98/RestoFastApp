import 'dotenv/config';
import { PrismaClient, RoleName } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS: Record<string, string> = {
  'users:manage': 'Crear y editar usuarios',
  'roles:manage': 'Administrar roles y permisos',
  'menu:manage': 'Administrar categorías y productos',
  'tables:manage': 'Administrar mesas',
  'orders:create': 'Crear órdenes',
  'orders:update': 'Actualizar órdenes',
  'orders:cancel': 'Cancelar órdenes',
  'orders:pay': 'Cobrar órdenes',
  'kitchen:view': 'Ver pedidos de cocina',
  'inventory:manage': 'Administrar inventario',
  'reservations:manage': 'Administrar reservaciones',
  'reports:view': 'Ver reportes',
  'caja:manage': 'Abrir y cerrar caja',
  'system:manage': 'Acceso al panel del operador del sistema',
};

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  ADMIN: Object.keys(PERMISSIONS).filter((code) => code !== 'system:manage'),
  SUPERADMIN: ['system:manage', 'roles:manage'],
  GERENTE: [
    'menu:manage',
    'tables:manage',
    'orders:create',
    'orders:update',
    'orders:cancel',
    'orders:pay',
    'inventory:manage',
    'reservations:manage',
    'reports:view',
    'caja:manage',
  ],
  CAJA: ['orders:create', 'orders:update', 'orders:pay', 'caja:manage'],
  MESERO: ['orders:create', 'orders:update'],
  COCINA: ['orders:update', 'kitchen:view'],
};

const CATEGORIES: { name: string; products: [string, number][] }[] = [
  {
    name: 'Entradas',
    products: [
      ['Cebiche clásico', 32],
      ['Papa a la huancaína', 18],
      ['Causa limeña', 22],
      ['Anticuchos de corazón', 20],
    ],
  },
  {
    name: 'Platos Fuertes',
    products: [
      ['Lomo saltado', 35],
      ['Ají de gallina', 28],
      ['Arroz con pollo', 26],
      ['Seco de res', 30],
    ],
  },
  {
    name: 'Bebidas',
    products: [
      ['Inca Kola', 6],
      ['Chicha morada', 5],
      ['Cerveza', 10],
      ['Limonada', 7],
    ],
  },
  {
    name: 'Postres',
    products: [
      ['Suspiro a la limeña', 12],
      ['Picarones', 10],
      ['Mazamorra morada', 8],
    ],
  },
];

const TABLES = [
  { number: 1, seats: 2 },
  { number: 2, seats: 2 },
  { number: 3, seats: 4 },
  { number: 4, seats: 4 },
  { number: 5, seats: 4 },
  { number: 6, seats: 6 },
  { number: 7, seats: 6 },
  { number: 8, seats: 8 },
  { number: 9, seats: 8 },
  { number: 10, seats: 10 },
];

// Lotes de demostración: `daysAgo` fija la fecha de ingreso para que el
// conteo de caducidad muestre alertas reales (caduca en 2 días, caducado...).
const INGREDIENTS: {
  name: string;
  unit: string;
  minStock: number;
  shelfLifeDays?: number;
  lots?: { daysAgo: number; quantity: number }[];
}[] = [
  {
    name: 'Huevo',
    unit: 'pza',
    minStock: 60,
    shelfLifeDays: 28,
    lots: [{ daysAgo: 2, quantity: 120 }],
  },
  {
    name: 'Lechuga',
    unit: 'kg',
    minStock: 3,
    shelfLifeDays: 5,
    lots: [{ daysAgo: 4, quantity: 5 }],
  },
  {
    name: 'Leche entera',
    unit: 'l',
    minStock: 6,
    shelfLifeDays: 14,
    lots: [{ daysAgo: 12, quantity: 10 }],
  },
  {
    name: 'Crema de leche',
    unit: 'l',
    minStock: 2,
    shelfLifeDays: 7,
    lots: [{ daysAgo: 8, quantity: 3 }],
  },
  {
    name: 'Pan',
    unit: 'kg',
    minStock: 5,
    lots: [{ daysAgo: 1, quantity: 3 }],
  },
  {
    name: 'Ají amarillo',
    unit: 'kg',
    minStock: 3,
    shelfLifeDays: 10,
    lots: [{ daysAgo: 6, quantity: 4 }],
  },
];

// Organización demo que adopta todos los datos de demostración.
async function ensureDemoOrganization() {
  const existing = await prisma.organization.findUnique({
    where: { slug: 'restobar' },
  });
  if (existing) {
    return prisma.organization.update({
      where: { id: existing.id },
      data: {
        maxUsers: 5,
        usersPanelPasswordHash: await bcrypt.hash(
          process.env.DEMO_USERS_PANEL_PASSWORD ?? 'demo123',
          10,
        ),
      },
    });
  }
  return prisma.organization.create({
    data: {
      name: 'Restobar',
      slug: 'restobar',
      plan: 'ACTIVE',
      maxUsers: 5,
      usersPanelPasswordHash: await bcrypt.hash(
        process.env.DEMO_USERS_PANEL_PASSWORD ?? 'demo123',
        10,
      ),
    },
  });
}

async function main() {
  console.log('Sembrando base de datos...');

  const demoOrg = await ensureDemoOrganization();
  const orgId = demoOrg.id;

  // Roles y permisos
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description },
    });
  }

  for (const [name, label] of Object.entries({
    ADMIN: 'Administrador',
    GERENTE: 'Gerente',
    CAJA: 'Caja',
    MESERO: 'Mesero',
    COCINA: 'Cocina',
    SUPERADMIN: 'Operador del Sistema',
  } as const)) {
    const role = await prisma.role.upsert({
      where: { name: name as RoleName },
      update: {},
      create: { name: name as RoleName, label },
    });

    const permissions = ROLE_PERMISSIONS[name as RoleName];
    const current = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { code: true } } },
    });
    const currentCodes = current.map((cp) => cp.permission.code);

    for (const code of permissions) {
      if (currentCodes.includes(code)) continue;
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    const sobrantes = currentCodes.filter(
      (code) => !permissions.includes(code),
    );
    for (const code of sobrantes) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
      });
    }
  }

  // Usuario administrador
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@restobar.pe' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@restobar.pe',
      passwordHash,
      roleId: adminRole.id,
      organizationId: orgId,
    },
  });

  // Usuarios de demostración por rol
  const demoUsers: { name: string; email: string; role: RoleName; password: string }[] = [
    { name: 'Gerente', email: 'gerente@restobar.pe', role: 'GERENTE', password: 'gerente123' },
    { name: 'Mesero', email: 'mesero@restobar.pe', role: 'MESERO', password: 'mesero123' },
    { name: 'Cocina', email: 'cocina@restobar.pe', role: 'COCINA', password: 'cocina123' },
    { name: 'Caja', email: 'caja@restobar.pe', role: 'CAJA', password: 'caja123' },
  ];
  for (const demo of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: demo.role } });
    const hash = await bcrypt.hash(demo.password, 10);
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        name: demo.name,
        email: demo.email,
        passwordHash: hash,
        roleId: role.id,
        organizationId: orgId,
      },
    });
  }

  // Operador del sistema (no pertenece a ninguna organización)
  const superadminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'SUPERADMIN' },
  });
  const operatorEmail = (process.env.OPERATOR_EMAIL ?? 'operador@restobar.pe').trim().toLowerCase();
  const operatorPassword = process.env.OPERATOR_PASSWORD ?? 'operador123';
  await prisma.user.upsert({
    where: { email: operatorEmail },
    update: {},
    create: {
      name: 'Operador del Sistema',
      email: operatorEmail,
      passwordHash: await bcrypt.hash(operatorPassword, 10),
      roleId: superadminRole.id,
      organizationId: null,
    },
  });

  // Categorías y productos
  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: {
        organizationId_name: { organizationId: orgId, name: cat.name },
      },
      update: {},
      create: { name: cat.name, sortOrder: CATEGORIES.indexOf(cat), organizationId: orgId },
    });
    for (const [name, price] of cat.products) {
      await prisma.product.upsert({
        where: { categoryId_name: { categoryId: category.id, name } },
        update: {},
        create: { categoryId: category.id, name, price, organizationId: orgId },
      });
    }
  }

  // Mesas con QR
  for (const t of TABLES) {
    await prisma.restaurantTable.upsert({
      where: {
        organizationId_number: { organizationId: orgId, number: t.number },
      },
      update: {},
      create: {
        number: t.number,
        seats: t.seats,
        qrToken: randomBytes(8).toString('hex'),
        organizationId: orgId,
      },
    });
  }

  // Inventario: ingredientes y lotes de demostración
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@restobar.pe' },
  });
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const ing of INGREDIENTS) {
    const ingredient = await prisma.ingredient.upsert({
      where: {
        organizationId_name: { organizationId: orgId, name: ing.name },
      },
      update: {},
      create: {
        name: ing.name,
        unit: ing.unit,
        minStock: ing.minStock,
        shelfLifeDays: ing.shelfLifeDays ?? null,
        organizationId: orgId,
      },
    });

    const lotCount = await prisma.inventoryLot.count({
      where: { ingredientId: ingredient.id },
    });
    if (lotCount === 0 && ing.lots?.length) {
      for (const lot of ing.lots) {
        const receivedAt = new Date(Date.now() - lot.daysAgo * DAY_MS);
        const expiresAt = ing.shelfLifeDays
          ? new Date(receivedAt.getTime() + ing.shelfLifeDays * DAY_MS)
          : null;
        const created = await prisma.inventoryLot.create({
          data: {
            ingredientId: ingredient.id,
            quantity: lot.quantity,
            remaining: lot.quantity,
            receivedAt,
            expiresAt,
          },
        });
        await prisma.inventoryMovement.create({
          data: {
            ingredientId: ingredient.id,
            lotId: created.id,
            type: 'IN',
            quantity: lot.quantity,
            note: 'Carga inicial',
            userId: admin.id,
          },
        });
        await prisma.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: { increment: lot.quantity } },
        });
      }
    }
  }

  const tables = await prisma.restaurantTable.count();
  const products = await prisma.product.count();
  const ingredients = await prisma.ingredient.count();
  console.log(
    `Seed completado: ${tables} mesas, ${products} productos, ${ingredients} ingredientes, roles y admin listos.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
