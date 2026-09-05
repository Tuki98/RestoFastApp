import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { TablesService } from './tables.service';

const ORG = 'org-1';

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError('campo duplicado', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('TablesService', () => {
  const prisma = {
    restaurantTable: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: TablesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TablesService(prisma as never);
  });

  describe('findAll', () => {
    it('devuelve mesas ordenadas, scoped por organización y sin datos sensibles', async () => {
      prisma.restaurantTable.findMany.mockResolvedValue([
        {
          id: 't1',
          number: 1,
          seats: 2,
          section: 'Interior',
          status: 'FREE',
          qrToken: 'abcd1234ef567890',
          _count: { orders: 0, reservations: 1 },
        },
      ]);

      const result = await service.findAll(ORG);

      expect(prisma.restaurantTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG },
          orderBy: { number: 'asc' },
        }),
      );
      expect(result[0]).toMatchObject({
        number: 1,
        ordersCount: 0,
        reservationsCount: 1,
      });
    });
  });

  describe('findByToken', () => {
    it('devuelve la mesa sin exponer el token', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({
        id: 't1',
        number: 3,
        seats: 4,
        section: 'Interior',
        status: 'FREE',
        qrToken: 'token',
      });

      const result = await service.findByToken('token');

      expect(result.number).toBe(3);
      expect(result).not.toHaveProperty('qrToken');
    });

    it('lanza NotFoundException si el token no existe', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);

      await expect(service.findByToken('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('genera un qrToken de 16 caracteres hex y liga la mesa a la organización', async () => {
      prisma.restaurantTable.create.mockImplementation(async (args) => ({
        id: 't1',
        ...args.data,
      }));

      const result = await service.create(ORG, { number: 11, seats: 4 });

      expect(result.qrToken).toMatch(/^[0-9a-f]{16}$/);
      expect(result.section).toBe('Interior');
      expect(result.organizationId).toBe(ORG);
    });

    it('usa la sección proporcionada', async () => {
      prisma.restaurantTable.create.mockImplementation(async (args) => ({
        id: 't1',
        ...args.data,
      }));

      const result = await service.create(ORG, {
        number: 12,
        seats: 6,
        section: 'Terraza',
      });

      expect(result.section).toBe('Terraza');
    });

    it('lanza ConflictException si el número ya existe', async () => {
      prisma.restaurantTable.create.mockRejectedValue(uniqueError());

      await expect(
        service.create(ORG, { number: 1, seats: 2 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si la mesa no existe o es de otra organización', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG, 't1', { seats: 8 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('actualiza los datos de la mesa', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 't1' });
      prisma.restaurantTable.update.mockResolvedValue({ id: 't1' });

      await service.update(ORG, 't1', { seats: 8, section: 'Bar' });

      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { number: undefined, seats: 8, section: 'Bar' },
      });
    });

    it('lanza ConflictException si el número nuevo ya existe', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 't1' });
      prisma.restaurantTable.update.mockRejectedValue(uniqueError());

      await expect(service.update(ORG, 't1', { number: 2 })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('lanza BadRequestException si la mesa tiene órdenes', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 't1',
        _count: { orders: 1 },
      });

      await expect(service.remove(ORG, 't1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.restaurantTable.delete).not.toHaveBeenCalled();
    });

    it('elimina la mesa sin órdenes', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 't1',
        _count: { orders: 0 },
      });
      prisma.restaurantTable.delete.mockResolvedValue({ id: 't1' });

      const result = await service.remove(ORG, 't1');

      expect(result).toEqual({ ok: true });
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG, 't1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
