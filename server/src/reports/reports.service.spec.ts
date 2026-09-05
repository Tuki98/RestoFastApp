import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

const ORG = 'org-1';

function localDate(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function keyDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('ReportsService', () => {
  const prisma = {
    order: { findMany: jest.fn() },
    payment: { findMany: jest.fn() },
    orderItem: { findMany: jest.fn() },
    restaurantTable: { count: jest.fn() },
    cashSession: { findMany: jest.fn() },
    inventoryMovement: { findMany: jest.fn() },
    ingredient: { findMany: jest.fn() },
    inventoryLot: { findMany: jest.fn() },
  };
  let service: ReportsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReportsService(prisma as never);
  });

  function paidOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      total: '100.00',
      orderType: 'DINE_IN',
      paidAt: localDate(2026, 8, 1, 12).toISOString(),
      ...overrides,
    };
  }

  describe('summary', () => {
    it('calcula ingresos, ticket promedio, desgloses y variación', async () => {
      prisma.order.findMany
        .mockResolvedValueOnce([
          paidOrder({ total: '522.00' }),
          paidOrder({ total: '450.00', orderType: 'TAKEOUT' }),
        ])
        .mockResolvedValueOnce([]) // cancelados
        .mockResolvedValueOnce([paidOrder({ total: '500.00' })]); // período anterior
      prisma.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: '320.00' },
        { method: 'CARD', amount: '300.00' },
        { method: 'YAPE_PLIN', amount: '48.50' },
      ]);

      const result = await service.summary(ORG, {});

      expect(result).toMatchObject({
        revenue: 972,
        ordersCount: 2,
        avgTicket: 486,
        cancelledCount: 0,
        cancelledAmount: 0,
        prevRevenue: 500,
        revenueDeltaPct: 94.4,
      });
      const cash = result.byPaymentMethod.find((e) => e.method === 'CASH');
      const card = result.byPaymentMethod.find((e) => e.method === 'CARD');
      const yape = result.byPaymentMethod.find((e) => e.method === 'YAPE_PLIN');
      expect(cash).toMatchObject({ amount: 320, count: 1 });
      expect(card).toMatchObject({ amount: 300, count: 1 });
      expect(yape).toMatchObject({ amount: 48.5, count: 1 });
      const dineIn = result.byOrderType.find((e) => e.type === 'DINE_IN');
      const takeout = result.byOrderType.find((e) => e.type === 'TAKEOUT');
      expect(dineIn).toMatchObject({ amount: 522, count: 1 });
      expect(takeout).toMatchObject({ amount: 450, count: 1 });
    });

    it('incluye cancelados y devuelve delta null sin período anterior', async () => {
      prisma.order.findMany
        .mockResolvedValueOnce([paidOrder({ total: '300.00' })])
        .mockResolvedValueOnce([paidOrder({ total: '80.00' })]) // cancelado
        .mockResolvedValueOnce([]); // período anterior vacío
      prisma.payment.findMany.mockResolvedValue([]);

      const result = await service.summary(ORG, {});

      expect(result).toMatchObject({
        revenue: 300,
        ordersCount: 1,
        cancelledCount: 1,
        cancelledAmount: 80,
        prevRevenue: 0,
        revenueDeltaPct: null,
      });
    });

    it('filtra por rango en los pedidos pagados y pagos', async () => {
      prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.payment.findMany.mockResolvedValue([]);

      await service.summary(ORG, { from: '2026-08-01', to: '2026-08-31' });

      expect(prisma.order.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG,
            status: 'PAID',
            paidAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: { organizationId: ORG },
            paidAt: expect.any(Object),
          }),
        }),
      );
    });

    it('lanza error con rango inválido', async () => {
      await expect(service.summary(ORG, { from: 'no-es-fecha' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza error si el inicio es posterior al fin', async () => {
      await expect(
        service.summary(ORG, { from: '2026-08-10', to: '2026-08-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('salesTrend', () => {
    it('agrupa por día, día de la semana y hora', async () => {
      prisma.order.findMany.mockResolvedValue([
        paidOrder({
          total: '100.00',
          paidAt: localDate(2026, 8, 10, 12).toISOString(),
        }),
        paidOrder({
          total: '200.00',
          paidAt: localDate(2026, 8, 10, 13).toISOString(),
        }),
        paidOrder({
          total: '50.00',
          paidAt: localDate(2026, 8, 11, 14).toISOString(),
        }),
      ]);

      const result = await service.salesTrend(ORG, { granularity: 'day' });

      const day10 = keyDay(localDate(2026, 8, 10));
      const day11 = keyDay(localDate(2026, 8, 11));
      expect(result.series).toEqual([
        { period: day10, revenue: 300, orders: 2 },
        { period: day11, revenue: 50, orders: 1 },
      ]);
      const dow = localDate(2026, 8, 10).getDay() === 0 ? 7 : localDate(2026, 8, 10).getDay();
      expect(result.byDayOfWeek[dow - 1]).toMatchObject({ revenue: 300, orders: 2 });
      expect(result.byHour[12]).toMatchObject({ revenue: 100, orders: 1 });
      expect(result.byHour[13]).toMatchObject({ revenue: 200, orders: 1 });
    });

    it('agrupa por mes cuando se pide granularidad mensual', async () => {
      prisma.order.findMany.mockResolvedValue([
        paidOrder({
          total: '120.00',
          paidAt: localDate(2026, 7, 5).toISOString(),
        }),
        paidOrder({
          total: '80.00',
          paidAt: localDate(2026, 8, 20).toISOString(),
        }),
      ]);

      const result = await service.salesTrend(ORG, { granularity: 'month' });

      expect(result.series).toEqual([
        { period: '2026-07', revenue: 120, orders: 1 },
        { period: '2026-08', revenue: 80, orders: 1 },
      ]);
    });

    it('devuelve series vacías sin ventas', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.salesTrend(ORG, {});

      expect(result.series).toEqual([]);
      expect(result.byDayOfWeek).toHaveLength(7);
      expect(result.byHour).toHaveLength(24);
    });
  });

  describe('topProducts', () => {
    function item(overrides: Record<string, unknown> = {}) {
      return {
        productId: 'p1',
        productName: 'Lomo saltado',
        unitPrice: '10.00',
        quantity: 2,
        product: { category: { name: 'Platos Fuertes' } },
        ...overrides,
      };
    }

    it('agrega por producto, calcula ingresos y ordena por recaudación', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        item(),
        item({ quantity: 2 }),
        item({
          productId: 'p2',
          productName: 'Cebiche',
          unitPrice: '5.00',
          quantity: 1,
          product: { category: { name: 'Entradas' } },
        }),
        item({
          productId: null,
          productName: 'Producto manual',
          unitPrice: '5.00',
          quantity: 2,
          product: null,
        }),
      ]);

      const result = await service.topProducts(ORG, {});

      expect(result.top[0]).toMatchObject({
        productId: 'p1',
        productName: 'Lomo saltado',
        quantity: 4,
        revenue: 40,
      });
      // Empate a 10: el manual (2 uds) precede al de 1 ud.
      expect(result.top[1].productName).toBe('Producto manual');
      expect(result.top[2]).toMatchObject({ productId: 'p2', revenue: 5 });
      expect(result.bottom.map((p) => p.productId)).toEqual(['p2', null, 'p1']);
      expect(result.byCategory[0]).toMatchObject({
        category: 'Platos Fuertes',
        revenue: 40,
        share: 72.73,
      });
    });

    it('respeta el límite solicitado', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        item(),
        item({ productId: 'p2', productName: 'Cebiche', quantity: 1 }),
        item({ productId: 'p3', productName: 'Causa', quantity: 1 }),
      ]);

      const result = await service.topProducts(ORG, { limit: 2 });

      expect(result.top).toHaveLength(2);
      expect(result.top[0].productId).toBe('p1');
    });
  });

  describe('serviceReport', () => {
    it('calcula tiempos, por mesero y ranking de mesas', async () => {
      const created = localDate(2026, 8, 1, 12);
      const at = (min: number) =>
        new Date(created.getTime() + min * 60000).toISOString();
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          orderType: 'DINE_IN',
          createdAt: created.toISOString(),
          paidAt: at(25),
          total: '100.00',
          table: { number: 3, section: 'Interior' },
          createdBy: { id: 'u1', name: 'Mesero' },
          statusHistory: [
            { status: 'PENDING', changedAt: at(0) },
            { status: 'READY', changedAt: at(10) },
            { status: 'SERVED', changedAt: at(20) },
          ],
        },
        {
          id: 'o2',
          orderType: 'TAKEOUT',
          createdAt: created.toISOString(),
          paidAt: at(5),
          total: '50.00',
          table: null,
          createdBy: { id: 'u1', name: 'Mesero' },
          statusHistory: [],
        },
      ]);
      prisma.restaurantTable.count.mockResolvedValue(10);

      const result = await service.serviceReport(ORG, {});

      expect(result.serviceTimes).toEqual({
        avgKitchenMs: 600000,
        avgTotalMs: 750000,
      });
      expect(result.byWaiter).toEqual([
        { userId: 'u1', name: 'Mesero', orders: 2, revenue: 150 },
      ]);
      expect(result.tables).toMatchObject({
        total: 10,
        occupied: 1,
        utilization: 10,
        avgOrdersPerTable: 1,
        avgDineInDurationMs: 1500000,
      });
      expect(result.tables.ranking).toEqual([
        { number: 3, section: 'Interior', orders: 1, revenue: 100 },
      ]);
    });

    it('devuelve nulos de tiempo sin historial suficiente', async () => {
      const created = localDate(2026, 8, 1, 12);
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          orderType: 'TAKEOUT',
          createdAt: created.toISOString(),
          paidAt: created.toISOString(),
          total: '30.00',
          table: null,
          createdBy: null,
          statusHistory: [],
        },
      ]);
      prisma.restaurantTable.count.mockResolvedValue(5);

      const result = await service.serviceReport(ORG, {});

      expect(result.serviceTimes.avgKitchenMs).toBeNull();
      expect(result.byWaiter[0]).toMatchObject({
        name: 'Sin mesero',
        orders: 1,
        revenue: 30,
      });
    });
  });

  describe('cashReport', () => {
    it('mapea los cierres con snapshot de totales', async () => {
      prisma.cashSession.findMany.mockResolvedValue([
        {
          id: 'c1',
          openedAt: localDate(2026, 8, 1, 9).toISOString(),
          closedAt: localDate(2026, 8, 1, 21).toISOString(),
          openingBalance: '100.00',
          closingCash: '200.00',
          closingCard: '300.00',
          closingYape: '50.00',
          ordersCount: 5,
          openedBy: { id: 'u1', name: 'Caja' },
          closedBy: { id: 'u2', name: 'Gerente' },
        },
        {
          id: 'c2',
          openedAt: localDate(2026, 8, 2, 9).toISOString(),
          closedAt: null,
          openingBalance: '50.00',
          closingCash: null,
          closingCard: null,
          closingYape: null,
          ordersCount: null,
          openedBy: { id: 'u1', name: 'Caja' },
          closedBy: null,
        },
      ]);

      const result = await service.cashReport(ORG, {});

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0]).toMatchObject({
        openingBalance: 100,
        cash: 200,
        card: 300,
        yape: 50,
        total: 550,
        ordersCount: 5,
        expectedCash: 300,
      });
      expect(result.sessions[1]).toMatchObject({
        total: 0,
        expectedCash: 50,
      });
    });
  });

  describe('inventoryReport', () => {
    it('calcula consumo, stock bajo y lotes por vencer', async () => {
      const now = new Date();
      const soon = new Date(now.getTime() + 5 * 86400000);
      const expired = new Date(now.getTime() - 2 * 86400000);
      prisma.inventoryMovement.findMany.mockResolvedValue([
        { ingredientId: 'i1', quantity: '2.5', ingredient: { name: 'Limón', unit: 'kg' } },
        { ingredientId: 'i1', quantity: '1.5', ingredient: { name: 'Limón', unit: 'kg' } },
        { ingredientId: 'i2', quantity: '1', ingredient: { name: 'Ají', unit: 'kg' } },
      ]);
      prisma.ingredient.findMany.mockResolvedValue([
        { name: 'Limón', unit: 'kg', stock: '10', minStock: '5' },
        { name: 'Ají', unit: 'kg', stock: '1', minStock: '5' },
      ]);
      prisma.inventoryLot.findMany
        .mockResolvedValueOnce([
          { remaining: '3', expiresAt: soon.toISOString(), ingredient: { id: 'i1', name: 'Limón', unit: 'kg' } },
        ])
        .mockResolvedValueOnce([
          { remaining: '2', expiresAt: expired.toISOString(), ingredient: { id: 'i2', name: 'Ají', unit: 'kg' } },
        ]);

      const result = await service.inventoryReport(ORG, {});

      expect(result.consumption).toEqual([
        { ingredientId: 'i1', name: 'Limón', unit: 'kg', quantity: 4 },
        { ingredientId: 'i2', name: 'Ají', unit: 'kg', quantity: 1 },
      ]);
      expect(result.lowStock).toEqual([
        { name: 'Ají', unit: 'kg', stock: 1, minStock: 5 },
      ]);
      expect(result.expiring.soon).toHaveLength(1);
      expect(result.expiring.soon[0]).toMatchObject({
        ingredientId: 'i1',
        ingredientName: 'Limón',
        remaining: 3,
      });
      expect(result.expiring.expired).toHaveLength(1);
      expect(result.expiring.expired[0]).toMatchObject({
        ingredientId: 'i2',
        ingredientName: 'Ají',
        remaining: 2,
      });
    });

    it('devuelve listas vacías sin movimientos ni alertas', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.ingredient.findMany.mockResolvedValue([]);
      prisma.inventoryLot.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.inventoryReport(ORG, {});

      expect(result.consumption).toEqual([]);
      expect(result.lowStock).toEqual([]);
      expect(result.expiring.soon).toEqual([]);
      expect(result.expiring.expired).toEqual([]);
    });
  });

  describe('export', () => {
    it('genera un libro de Excel con todas las hojas', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.orderItem.findMany.mockResolvedValue([]);
      prisma.restaurantTable.count.mockResolvedValue(0);
      prisma.cashSession.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.ingredient.findMany.mockResolvedValue([]);
      prisma.inventoryLot.findMany.mockResolvedValue([]);

      const buffer = await service.export(ORG, {});

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer[0]).toBe(0x50); // 'P' de un archivo zip/xlsx
      expect(buffer[1]).toBe(0x4b); // 'K'
    });
  });
});
