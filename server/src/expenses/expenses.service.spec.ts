import { NotFoundException } from '@nestjs/common';
import { ExpenseCategory } from '../../generated/prisma/enums';
import { ExpensesService } from './expenses.service';

const ORG = 'org-1';
const USER = 'u1';

describe('ExpensesService', () => {
  const prisma = {
    expense: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: ExpensesService;

  function expenseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'e1',
      organizationId: ORG,
      description: 'Compra de verduras',
      amount: '45.50',
      category: ExpenseCategory.INSUMOS,
      incurredAt: new Date('2026-08-16T10:00:00.000Z'),
      note: null,
      registeredById: USER,
      registeredBy: { id: USER, name: 'Gerente' },
      createdAt: new Date('2026-08-16T10:05:00.000Z'),
      updatedAt: new Date('2026-08-16T10:05:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ExpensesService(prisma as never);
  });

  describe('findAll', () => {
    it('lista los gastos de la organización con el monto como número', async () => {
      prisma.expense.findMany.mockResolvedValue([expenseRow()]);

      const result = await service.findAll(ORG);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'e1',
        description: 'Compra de verduras',
        amount: 45.5,
        category: ExpenseCategory.INSUMOS,
        registeredBy: { id: USER, name: 'Gerente' },
      });
      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG },
        }),
      );
    });

    it('aplica filtros de fecha y categoría', async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.findAll(ORG, {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
        category: ExpenseCategory.SERVICIOS,
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG,
            category: ExpenseCategory.SERVICIOS,
            incurredAt: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-31T23:59:59.000Z'),
            },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('registra el gasto con el usuario y recorta la descripción', async () => {
      prisma.expense.create.mockResolvedValue(expenseRow());

      const result = await service.create(ORG, USER, {
        description: '  Compra de verduras  ',
        amount: 45.5,
        category: ExpenseCategory.INSUMOS,
      });

      expect(result.amount).toBe(45.5);
      expect(prisma.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG,
            description: 'Compra de verduras',
            amount: 45.5,
            category: ExpenseCategory.INSUMOS,
            registeredById: USER,
          }),
        }),
      );
    });

    it('usa OTROS y la fecha actual por defecto', async () => {
      prisma.expense.create.mockResolvedValue(expenseRow());

      await service.create(ORG, USER, {
        description: 'Varios',
        amount: 10,
      });

      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.category).toBe(ExpenseCategory.OTROS);
      expect(data.incurredAt).toBeInstanceOf(Date);
      expect(data.note).toBeNull();
    });
  });

  describe('update', () => {
    it('lanza NotFound si el gasto no existe', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG, 'missing', { description: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('actualiza solo los campos enviados', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.expense.update.mockResolvedValue(
        expenseRow({ description: 'Nueva descripción' }),
      );

      const result = await service.update(ORG, 'e1', {
        description: 'Nueva descripción',
      });

      expect(result.description).toBe('Nueva descripción');
      expect(prisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e1' },
          data: { description: 'Nueva descripción' },
        }),
      );
    });
  });

  describe('remove', () => {
    it('elimina un gasto existente', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.expense.delete.mockResolvedValue({ id: 'e1' });

      const result = await service.remove(ORG, 'e1');

      expect(result).toEqual({ id: 'e1' });
      expect(prisma.expense.delete).toHaveBeenCalledWith({
        where: { id: 'e1' },
      });
    });

    it('lanza NotFound si el gasto no existe', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG, 'missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });
  });
});
