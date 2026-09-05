import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CategoriesService } from './categories.service';

const ORG = 'org-1';

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError('campo duplicado', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CategoriesService', () => {
  const prisma = {
    category: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: CategoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CategoriesService(prisma as never);
  });

  describe('findAll', () => {
    it('convierte los precios de producto a número y filtra por organización', async () => {
      prisma.category.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Entradas',
          sortOrder: 0,
          active: true,
          products: [{ id: 'p1', name: 'Guacamole', price: 145 }],
        },
      ]);

      const result = await service.findAll(ORG);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG } }),
      );
      expect(result[0].products[0].price).toBe(145);
      expect(typeof result[0].products[0].price).toBe('number');
    });

    it('ordena por sortOrder y luego nombre', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      await service.findAll(ORG);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
      );
    });
  });

  describe('create', () => {
    it('crea la categoría recortando espacios y ligada a la organización', async () => {
      prisma.category.create.mockResolvedValue({ id: 'c1', name: 'Postres' });

      const result = await service.create(ORG, {
        name: '  Postres  ',
        sortOrder: 2,
      });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Postres', sortOrder: 2, organizationId: ORG },
      });
      expect(result.id).toBe('c1');
    });

    it('usa sortOrder 0 si no se envía', async () => {
      prisma.category.create.mockResolvedValue({ id: 'c1' });

      await service.create(ORG, { name: 'Bebidas' });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Bebidas', sortOrder: 0, organizationId: ORG },
      });
    });

    it('lanza ConflictException si el nombre ya existe', async () => {
      prisma.category.create.mockRejectedValue(uniqueError());

      await expect(service.create(ORG, { name: 'Entradas' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('actualiza nombre, orden y estado', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.category.update.mockResolvedValue({ id: 'c1' });

      await service.update(ORG, 'c1', {
        name: '  Nuevo ',
        sortOrder: 1,
        active: false,
      });

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', organizationId: ORG },
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Nuevo', sortOrder: 1, active: false },
      });
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG, 'c1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si pertenece a otra organización', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG, 'c1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ConflictException si el nombre nuevo ya existe', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.category.update.mockRejectedValue(uniqueError());

      await expect(
        service.update(ORG, 'c1', { name: 'Entradas' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('lanza BadRequestException si tiene productos', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        _count: { products: 2 },
      });

      await expect(service.remove(ORG, 'c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('elimina la categoría vacía', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        _count: { products: 0 },
      });
      prisma.category.delete.mockResolvedValue({ id: 'c1' });

      const result = await service.remove(ORG, 'c1');

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG, 'c1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
