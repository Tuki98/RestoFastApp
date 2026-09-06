import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

const ORG = 'org-1';

describe('OrdersService', () => {
  const prisma = {
    product: { findMany: jest.fn() },
    restaurantTable: { findFirst: jest.fn(), update: jest.fn() },
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    orderStatusHistory: { create: jest.fn() },
    payment: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: OrdersService;

  function mockTransaction() {
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
      const tx = {
        order: {
          create: prisma.order.create,
          update: prisma.order.update,
          findUnique: prisma.order.findUnique,
        },
        restaurantTable: { update: prisma.restaurantTable.update },
        orderStatusHistory: { create: prisma.orderStatusHistory.create },
        payment: { create: prisma.payment.create },
      };
      return fn(tx);
    });
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      folio: 1,
      orderType: 'DINE_IN',
      tableId: 't1',
      table: { id: 't1', number: 3, section: 'Interior' },
      status: 'PENDING',
      notes: null,
      subtotal: '450.00',
      tax: '72.00',
      total: '522.00',
      createdAt: '2026-01-01T00:00:00.000Z',
      paidAt: null,
      createdById: 'u1',
      createdBy: { id: 'u1', name: 'Mesero' },
      items: [
        {
          id: 'i1',
          productId: 'p1',
          productName: 'Hamburguesa clásica',
          unitPrice: '135.00',
          quantity: 1,
          notes: null,
        },
      ],
      payments: [],
      statusHistory: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrdersService(prisma as never);
    mockTransaction();
  });

  describe('create', () => {
    const dto = {
      orderType: 'DINE_IN' as const,
      tableId: 't1',
      items: [{ productId: 'p1', quantity: 2 }],
    };

    it('requiere mesa para comandas de mesa', async () => {
      await expect(
        service.create(ORG, 'u1', {
          orderType: 'DINE_IN',
          items: dto.items,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('rechaza mesa en comandas para llevar', async () => {
      await expect(
        service.create(ORG, 'u1', {
          orderType: 'TAKEOUT',
          tableId: 't1',
          items: dto.items,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('valida que los productos existan', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }]);
      await expect(
        service.create(ORG, 'u1', {
          ...dto,
          items: [
            { productId: 'p1', quantity: 1 },
            { productId: 'pX', quantity: 1 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.any(Array) }, organizationId: ORG },
        }),
      );
    });

    it('valida que la mesa exista', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Hamburguesa clásica', price: 135 },
      ]);
      prisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG, 'u1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('crea la orden con snapshots y totales (sin IVA por defecto); marca la mesa ocupada', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Hamburguesa clásica', price: 135 },
        { id: 'p2', name: 'Cerveza', price: 55 },
      ]);
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 't1' });
      prisma.order.create.mockResolvedValue(orderRow());

      const result = await service.create(ORG, 'u1', {
        ...dto,
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1, notes: '  sin hielo  ' },
        ],
      });

      const created = prisma.order.create.mock.calls[0][0];
      expect(created.data.organizationId).toBe(ORG);
      expect(created.data.orderType).toBe('DINE_IN');
      expect(created.data.status).toBe('PENDING');
      expect(created.data.createdById).toBe('u1');
      expect(created.data.subtotal).toBe(325);
      expect(created.data.tax).toBe(0);
      expect(created.data.total).toBe(325);
      expect(created.data.items.create).toHaveLength(2);
      expect(created.data.items.create[0]).toMatchObject({
        productId: 'p1',
        productName: 'Hamburguesa clásica',
        unitPrice: 135,
        quantity: 2,
      });
      expect(created.data.items.create[1].notes).toBe('sin hielo');
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'OCCUPIED' },
      });
      expect(result.subtotal).toBe(450);
      expect(result.total).toBe(522);
    });

    it('no marca mesa ocupada en comandas para llevar', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Cerveza', price: 55 },
      ]);
      prisma.order.create.mockResolvedValue(
        orderRow({ orderType: 'TAKEOUT', tableId: null, table: null }),
      );

      await service.create(ORG, 'u1', {
        orderType: 'TAKEOUT',
        items: [{ productId: 'p1', quantity: 1 }],
      });

      expect(prisma.restaurantTable.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll / findOne', () => {
    it('serializa precios a número', async () => {
      prisma.order.findMany.mockResolvedValue([
        orderRow({ subtotal: '100.00', tax: '16.00', total: '116.00' }),
      ]);

      const result = await service.findAll(ORG);

      expect(result[0].subtotal).toBe(100);
      expect(result[0].tax).toBe(16);
      expect(result[0].total).toBe(116);
      expect(result[0].items[0].unitPrice).toBe(135);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG } }),
      );
    });

    it('lanza NotFound si la orden no existe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calcula el tiempo que la orden pasó en cada estado', async () => {
      prisma.order.findMany.mockResolvedValue([
        orderRow({
          status: 'READY',
          createdAt: '2026-01-01T00:00:00.000Z',
          statusHistory: [
            { status: 'PENDING', changedAt: '2026-01-01T00:00:00.000Z' },
            {
              status: 'IN_PREPARATION',
              changedAt: '2026-01-01T00:05:00.000Z',
            },
            { status: 'READY', changedAt: '2026-01-01T00:12:00.000Z' },
          ],
        }),
      ]);

      const [order] = await service.findAll(ORG);

      expect(order.statusTimes).toHaveLength(3);
      expect(order.statusTimes[0]).toMatchObject({
        status: 'PENDING',
        durationMs: 300_000,
        endedAt: '2026-01-01T00:05:00.000Z',
      });
      expect(order.statusTimes[1]).toMatchObject({
        status: 'IN_PREPARATION',
        durationMs: 420_000,
      });
      expect(order.statusTimes[2]).toMatchObject({
        status: 'READY',
        endedAt: null,
      });
      expect(order.statusTimes[2].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateStatus', () => {
    it('lanza NotFound si no existe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStatus(ORG, 'o1', { status: 'IN_PREPARATION' }, 'u2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza transiciones inválidas', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'PENDING' }));
      await expect(
        service.updateStatus(ORG, 'o1', { status: 'SERVED' }, 'u2'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('avanza PENDING → IN_PREPARATION y registra el historial', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'PENDING' }));
      prisma.order.update.mockResolvedValue(
        orderRow({ status: 'IN_PREPARATION' }),
      );

      await service.updateStatus(ORG, 'o1', { status: 'IN_PREPARATION' }, 'u2');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o1' },
          data: { status: 'IN_PREPARATION' },
        }),
      );
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o1',
          status: 'IN_PREPARATION',
          changedById: 'u2',
        },
      });
    });

    it('no permite modificar órdenes pagadas', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'PAID' }));
      await expect(
        service.updateStatus(ORG, 'o1', { status: 'READY' }, 'u2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancela, libera la mesa y registra el historial', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'SERVED' }));
      prisma.order.update.mockResolvedValue(orderRow({ status: 'CANCELLED' }));

      await service.cancel(ORG, 'o1', 'u2');

      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'FREE' },
      });
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: { orderId: 'o1', status: 'CANCELLED', changedById: 'u2' },
      });
    });

    it('no cancela órdenes pagadas', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'PAID' }));
      await expect(service.cancel(ORG, 'o1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('pay', () => {
    it('cobra, crea el pago con el total y libera la mesa', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderRow({ status: 'SERVED', total: '522.00' }),
      );
      prisma.order.update.mockResolvedValue(
        orderRow({ status: 'PAID', paidAt: '2026-01-01T00:00:00.000Z' }),
      );

      await service.pay(ORG, 'o1', { method: 'CASH' }, 'u3');

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o1',
          method: 'CASH',
          amount: '522.00',
          receivedById: 'u3',
        },
      });
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAID', paidAt: expect.any(Date) },
        }),
      );
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'FREE' },
      });
    });

    it('no cobra una orden ya pagada ni cancelada', async () => {
      prisma.order.findFirst.mockResolvedValue(orderRow({ status: 'PAID' }));
      await expect(
        service.pay(ORG, 'o1', { method: 'CARD' }, 'u3'),
      ).rejects.toThrow(BadRequestException);

      prisma.order.findFirst.mockResolvedValue(
        orderRow({ status: 'CANCELLED' }),
      );
      await expect(
        service.pay(ORG, 'o1', { method: 'CARD' }, 'u3'),
      ).rejects.toThrow(BadRequestException);
    });

    it('aplica IGV al cobrar cuando applyIgv es true', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderRow({
          status: 'SERVED',
          subtotal: '450.00',
          tax: '0.00',
          total: '450.00',
        }),
      );
      prisma.order.update.mockResolvedValue(
        orderRow({ status: 'PAID', paidAt: '2026-01-01T00:00:00.000Z' }),
      );

      await service.pay(ORG, 'o1', { method: 'CASH', applyIgv: true }, 'u3');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            tax: 72,
            total: 522,
          }),
        }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o1',
          method: 'CASH',
          amount: 522,
          receivedById: 'u3',
        },
      });
    });

    it('cobra sin IGV cuando applyIgv no se envía', async () => {
      prisma.order.findFirst.mockResolvedValue(
        orderRow({
          status: 'SERVED',
          subtotal: '450.00',
          tax: '0.00',
          total: '450.00',
        }),
      );

      await service.pay(ORG, 'o1', { method: 'YAPE_PLIN' }, 'u3');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAID', paidAt: expect.any(Date) },
        }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o1',
          method: 'YAPE_PLIN',
          amount: '450.00',
          receivedById: 'u3',
        },
      });
    });
  });

  describe('findOpenByTable', () => {
    it('busca solo órdenes abiertas de la mesa', async () => {
      prisma.order.findMany.mockResolvedValue([orderRow()]);

      const result = await service.findOpenByTable(ORG, 't1');

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tableId: 't1',
            organizationId: ORG,
            status: {
              in: [
                'PENDING',
                'IN_PREPARATION',
                'READY',
                'SERVED',
                'AWAITING_CONFIRMATION',
              ],
            },
          },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
