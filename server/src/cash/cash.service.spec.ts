import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashService } from './cash.service';

const ORG = 'org-1';

describe('CashService', () => {
  const prisma = {
    cashSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    order: { findMany: jest.fn(), findFirst: jest.fn() },
    payment: { findMany: jest.fn() },
    expense: { findMany: jest.fn() },
  };
  let service: CashService;

  function sessionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'c1',
      openedAt: '2026-08-11T00:00:00.000Z',
      closedAt: null,
      openingBalance: '100.00',
      closingCash: null,
      closingCard: null,
      closingYape: null,
      closingExpenses: null,
      expensesCount: null,
      ordersCount: null,
      openedById: 'u1',
      openedBy: { id: 'u1', name: 'Caja' },
      closedById: null,
      closedBy: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.expense.findMany.mockResolvedValue([]);
    service = new CashService(prisma as never);
  });

  describe('getCurrent', () => {
    it('devuelve null si no hay caja abierta', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(null);

      const result = await service.getCurrent(ORG);

      expect(result).toBeNull();
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
      expect(prisma.cashSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { closedAt: null, organizationId: ORG },
        }),
      );
    });

    it('devuelve la caja abierta con el resumen en vivo por método', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(sessionRow());
      prisma.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: '320.00' },
        { method: 'YAPE_PLIN', amount: '48.50' },
      ]);

      const result = await service.getCurrent(ORG);

      expect(result).toMatchObject({
        id: 'c1',
        openingBalance: 100,
        closedAt: null,
        summary: {
          ordersCount: 2,
          totalIncome: 368.5,
          expectedCash: 420,
        },
      });
      const byMethod = result?.summary.incomeByMethod;
      expect(byMethod?.find((e) => e.method === 'CASH')?.amount).toBe(320);
      expect(byMethod?.find((e) => e.method === 'CARD')?.amount).toBe(0);
      expect(byMethod?.find((e) => e.method === 'YAPE_PLIN')?.amount).toBe(
        48.5,
      );
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            order: { organizationId: ORG },
            paidAt: {
              gte: expect.anything(),
              lt: expect.any(Date),
            },
          },
        }),
      );
    });

    it('descuenta los gastos del turno del efectivo esperado', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(sessionRow());
      prisma.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: '320.00' },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e1',
          description: 'Verduras',
          amount: '20.00',
          category: 'INSUMOS',
          incurredAt: new Date('2026-08-11T10:00:00.000Z'),
        },
        {
          id: 'e2',
          description: 'Taxi',
          amount: '15.50',
          category: 'TRANSPORTE',
          incurredAt: new Date('2026-08-11T11:00:00.000Z'),
        },
      ]);

      const result = await service.getCurrent(ORG);

      expect(result?.summary.expenses).toMatchObject({
        total: 35.5,
        count: 2,
      });
      expect(result?.summary.expenses.items).toHaveLength(2);
      expect(result?.summary.netIncome).toBe(284.5);
      expect(result?.summary.expectedCash).toBe(384.5);
      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG,
            incurredAt: { gte: expect.anything(), lt: expect.any(Date) },
          },
        }),
      );
    });
  });

  describe('getHistory', () => {
    it('usa el snapshot para cierres y resumen en vivo para la abierta', async () => {
      prisma.cashSession.findMany.mockResolvedValue([
        sessionRow({
          id: 'c2',
          closedAt: '2026-08-11T12:00:00.000Z',
          closingCash: '200.00',
          closingCard: '300.00',
          closingYape: '50.00',
          ordersCount: 5,
        }),
        sessionRow({ id: 'c1' }),
      ]);
      prisma.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: '80.00' },
      ]);

      const result = await service.getHistory(ORG);

      expect(result).toHaveLength(2);
      const closed = result[0];
      expect(closed.id).toBe('c2');
      expect(closed.summary.totalIncome).toBe(550);
      expect(closed.summary.ordersCount).toBe(5);
      const open = result[1];
      expect(open.id).toBe('c1');
      expect(open.summary.totalIncome).toBe(80);
    });
  });

  describe('open', () => {
    it('abre la caja con la caja chica y resumen en ceros', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(null);
      prisma.cashSession.create.mockResolvedValue(
        sessionRow({ id: 'c1', openingBalance: '150.00' }),
      );

      const result = await service.open(ORG, 'u1', { openingBalance: 150 });

      expect(result).toMatchObject({
        id: 'c1',
        openingBalance: 150,
        summary: {
          totalIncome: 0,
          ordersCount: 0,
          expectedCash: 150,
        },
      });
      expect(prisma.cashSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG,
            openingBalance: 150,
            openedById: 'u1',
          }),
        }),
      );
    });

    it('lanza error si ya hay una caja abierta', async () => {
      prisma.cashSession.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(
        service.open(ORG, 'u1', { openingBalance: 150 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.cashSession.create).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('lanza NotFound si la sesión no existe', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(null);

      await expect(service.close(ORG, 'u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza error si la caja ya está cerrada', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(
        sessionRow({ closedAt: '2026-08-11T12:00:00.000Z' }),
      );

      await expect(service.close(ORG, 'u1', 'c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cashSession.updateMany).not.toHaveBeenCalled();
    });

    it('lanza error si hay comandas abiertas al intentar cerrar', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(sessionRow());
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', folio: 3, status: 'PENDING' },
        { id: 'o2', folio: 4, status: 'IN_PREPARATION' },
      ]);

      await expect(service.close(ORG, 'u2', 'c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cashSession.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG,
            status: { notIn: ['PAID', 'CANCELLED'] },
          },
        }),
      );
    });

    it('guarda el snapshot de totales y devuelve el resumen', async () => {
      prisma.cashSession.findFirst
        .mockResolvedValueOnce(sessionRow())
        .mockResolvedValueOnce(
          sessionRow({
            closedAt: '2026-08-11T22:00:00.000Z',
            closingCash: '100.00',
            closingCard: '200.00',
            closingYape: '30.50',
            ordersCount: 3,
            closedById: 'u2',
            closedBy: { id: 'u2', name: 'Gerente' },
          }),
        );
      prisma.order.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: '100.00' },
        { method: 'CARD', amount: '200.00' },
        { method: 'YAPE_PLIN', amount: '30.50' },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e1',
          description: 'Gas',
          amount: '20.00',
          category: 'SERVICIOS',
          incurredAt: new Date('2026-08-11T10:00:00.000Z'),
        },
      ]);
      prisma.cashSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.close(ORG, 'u2', 'c1');

      expect(result).toMatchObject({
        closedAt: '2026-08-11T22:00:00.000Z',
        closedBy: { id: 'u2', name: 'Gerente' },
        summary: {
          totalIncome: 330.5,
          ordersCount: 3,
          netIncome: 310.5,
          expectedCash: 180,
        },
      });
      expect(result.summary.expenses).toMatchObject({ total: 20, count: 1 });
      expect(prisma.cashSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'c1', closedAt: null }),
          data: expect.objectContaining({
            closedAt: expect.any(Date),
            closedById: 'u2',
            closingCash: 100,
            closingCard: 200,
            closingYape: 30.5,
            closingExpenses: 20,
            expensesCount: 1,
            ordersCount: 3,
          }),
        }),
      );
    });

    it('lanza error si otro cajero ya cerró la caja', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(sessionRow());
      prisma.order.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.cashSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.close(ORG, 'u2', 'c1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
