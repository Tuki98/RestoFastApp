import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { InventoryService } from './inventory.service';

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const ORG = 'org-1';

describe('InventoryService', () => {
  const prisma = {
    ingredient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inventoryLot: { create: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: InventoryService;
  let tx: Record<string, Record<string, jest.Mock>>;

  function mockTransaction() {
    tx = {
      ingredient: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      inventoryLot: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      inventoryMovement: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryService(prisma as never);
  });

  describe('findIngredients', () => {
    it('convierte stock y calcula lowStock y alertas de lote', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'Huevo',
          unit: 'pza',
          stock: 50,
          minStock: 60,
          shelfLifeDays: 28,
          active: true,
          lots: [
            {
              id: 'l1',
              quantity: 120,
              remaining: 50,
              receivedAt: new Date(now() - 2 * DAY),
              expiresAt: new Date(now() + 26 * DAY),
              exitedAt: null,
            },
            {
              id: 'l2',
              quantity: 100,
              remaining: 0,
              receivedAt: new Date(now()),
              expiresAt: new Date(now() + DAY),
              exitedAt: new Date(now()),
            },
          ],
        },
      ]);

      const [result] = await service.findIngredients(ORG);

      expect(result.stock).toBe(50);
      expect(result.lowStock).toBe(true);
      expect(result.lots[0].alert).toBeNull();
      expect(result.lots[1].alert).toBeNull();
      expect(result.lots[1].daysLeft).toBe(1);
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG } }),
      );
    });

    it('marca EXPIRING_SOON cuando faltan 2 días o menos y EXPIRED al vencer', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'Leche',
          unit: 'l',
          stock: 4,
          minStock: 3,
          shelfLifeDays: 14,
          active: true,
          lots: [
            {
              id: 'l1',
              quantity: 10,
              remaining: 3,
              receivedAt: new Date(now() - 12 * DAY),
              expiresAt: new Date(now() + 2 * DAY),
              exitedAt: null,
            },
            {
              id: 'l2',
              quantity: 3,
              remaining: 1,
              receivedAt: new Date(now() - 8 * DAY),
              expiresAt: new Date(now() - DAY),
              exitedAt: null,
            },
          ],
        },
      ]);

      const [result] = await service.findIngredients(ORG);

      expect(result.lots[0].alert).toBe('EXPIRING_SOON');
      expect(result.lots[0].daysLeft).toBe(2);
      expect(result.lots[1].alert).toBe('EXPIRED');
      expect(result.lots[1].daysLeft).toBeLessThan(0);
    });
  });

  describe('createIngredient', () => {
    it('crea con nombre recortado y valores por defecto', async () => {
      prisma.ingredient.create.mockResolvedValue({ id: 'i1' });

      await service.createIngredient(ORG, { name: '  Huevo  ', unit: ' pza ' });

      expect(prisma.ingredient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG,
          name: 'Huevo',
          unit: 'pza',
          minStock: 0,
          shelfLifeDays: null,
          active: true,
        }),
      });
    });

    it('lanza ConflictException si ya existe el nombre', async () => {
      prisma.ingredient.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createIngredient(ORG, { name: 'Huevo', unit: 'pza' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateIngredient', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(null);

      await expect(
        service.updateIngredient(ORG, 'i1', { unit: 'kg' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'i1', organizationId: ORG } }),
      );
    });
  });

  describe('removeIngredient', () => {
    it('lanza ConflictException si tiene movimientos (P2003)', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'i1' });
      prisma.ingredient.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fk', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      await expect(service.removeIngredient(ORG, 'i1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('elimina sin movimientos', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({ id: 'i1' });
      prisma.ingredient.delete.mockResolvedValue({ id: 'i1' });

      const result = await service.removeIngredient(ORG, 'i1');

      expect(result).toEqual({ ok: true });
    });
  });

  describe('registerEntry', () => {
    beforeEach(mockTransaction);

    it('crea el lote con caducidad = ingreso + shelfLifeDays y suma stock', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'i1',
        shelfLifeDays: 10,
        unit: 'pza',
      });
      const receivedAt = new Date('2026-01-01T00:00:00Z');
      tx.inventoryLot.create.mockResolvedValue({ id: 'l1' });

      await service.registerEntry(
        ORG,
        'i1',
        { quantity: 2.5, receivedAt: '2026-01-01' },
        'u1',
      );

      const lotData = tx.inventoryLot.create.mock.calls[0][0].data;
      expect(lotData.ingredientId).toBe('i1');
      expect(lotData.quantity).toBe(2.5);
      expect(lotData.remaining).toBe(2.5);
      expect(lotData.receivedAt.getTime()).toBe(receivedAt.getTime());
      expect(lotData.expiresAt.getTime()).toBe(receivedAt.getTime() + 10 * DAY);
      expect(tx.ingredient.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { stock: { increment: 2.5 } },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          ingredientId: 'i1',
          lotId: 'l1',
          type: 'IN',
          quantity: 2.5,
          note: null,
          userId: 'u1',
        },
      });
    });

    it('sin shelfLifeDays no calcula caducidad', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'i1',
        shelfLifeDays: null,
        unit: 'kg',
      });
      tx.inventoryLot.create.mockResolvedValue({ id: 'l1' });

      await service.registerEntry(ORG, 'i1', { quantity: 3 }, 'u1');

      const lotData = tx.inventoryLot.create.mock.calls[0][0].data;
      expect(lotData.expiresAt).toBeNull();
    });

    it('rechaza una fecha de ingreso futura', async () => {
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'i1',
        shelfLifeDays: 5,
        unit: 'kg',
      });

      await expect(
        service.registerEntry(
          ORG,
          'i1',
          { quantity: 1, receivedAt: '2999-01-01' },
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.inventoryLot.create).not.toHaveBeenCalled();
    });
  });

  describe('registerExit', () => {
    beforeEach(mockTransaction);

    it('rechaza si el stock es insuficiente', async () => {
      tx.ingredient.findFirst.mockResolvedValue({
        id: 'i1',
        unit: 'kg',
        stock: 5,
      });

      await expect(
        service.registerExit(ORG, 'i1', { quantity: 10 }, 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(tx.inventoryLot.findMany).not.toHaveBeenCalled();
    });

    it('consume primero el lote que caduca antes (FEFO) y registra salida', async () => {
      tx.ingredient.findFirst.mockResolvedValue({
        id: 'i1',
        unit: 'kg',
        stock: 14,
      });
      tx.inventoryLot.findMany.mockResolvedValue([
        {
          id: 'lA',
          remaining: 10,
          receivedAt: new Date(now() - 1 * DAY),
          expiresAt: new Date(now() + 20 * DAY),
        },
        {
          id: 'lB',
          remaining: 4,
          receivedAt: new Date(now() - 1 * DAY),
          expiresAt: new Date(now() + 2 * DAY),
        },
      ]);

      await service.registerExit(ORG, 'i1', { quantity: 6 }, 'u1');

      const updates = tx.inventoryLot.update.mock.calls.map((c) => c[0]);
      expect(updates[0]).toEqual({
        where: { id: 'lB' },
        data: { remaining: 0, exitedAt: expect.any(Date) },
      });
      expect(updates[1]).toEqual({
        where: { id: 'lA' },
        data: { remaining: 8, exitedAt: null },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
      expect(tx.ingredient.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { stock: { decrement: 6 } },
      });
    });

    it('lanza NotFoundException si el ingrediente no existe', async () => {
      tx.ingredient.findFirst.mockResolvedValue(null);

      await expect(
        service.registerExit(ORG, 'i1', { quantity: 1 }, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAlerts', () => {
    it('devuelve alertas ordenadas: caducados, por caducar y stock bajo', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'Crema',
          unit: 'l',
          stock: 1,
          minStock: 2,
          shelfLifeDays: 7,
          active: true,
          lots: [
            {
              id: 'l1',
              quantity: 3,
              remaining: 1,
              receivedAt: new Date(now() - 8 * DAY),
              expiresAt: new Date(now() - DAY),
              exitedAt: null,
            },
          ],
        },
        {
          id: 'i2',
          name: 'Leche',
          unit: 'l',
          stock: 4,
          minStock: 3,
          shelfLifeDays: 14,
          active: true,
          lots: [
            {
              id: 'l2',
              quantity: 10,
              remaining: 4,
              receivedAt: new Date(now() - 12 * DAY),
              expiresAt: new Date(now() + 2 * DAY),
              exitedAt: null,
            },
          ],
        },
        {
          id: 'i3',
          name: 'Tortilla',
          unit: 'kg',
          stock: 3,
          minStock: 5,
          shelfLifeDays: null,
          active: true,
          lots: [],
        },
      ]);

      const alerts = await service.getAlerts(ORG);

      expect(alerts.map((a) => a.type)).toEqual([
        'EXPIRED',
        'EXPIRING_SOON',
        'LOW_STOCK',
        'LOW_STOCK',
      ]);
      expect((alerts[1] as { daysLeft: number }).daysLeft).toBe(2);
    });
  });

  describe('findMovements', () => {
    it('serializa cantidades a número', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([
        {
          id: 'm1',
          type: 'IN',
          quantity: 5,
          note: null,
          createdAt: new Date(),
          ingredient: { id: 'i1', name: 'Huevo', unit: 'pza' },
          user: { id: 'u1', name: 'Admin' },
        },
      ]);

      const [result] = await service.findMovements(ORG);

      expect(result.quantity).toBe(5);
      expect(typeof result.quantity).toBe('number');
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ingredient: { organizationId: ORG } },
        }),
      );
    });
  });
});
