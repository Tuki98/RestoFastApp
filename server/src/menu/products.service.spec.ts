import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ProductsService } from './products.service';

const ORG = 'org-1';

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError('campo duplicado', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('ProductsService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    category: { findFirst: jest.fn() },
  };
  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as never);
  });

  describe('findAll', () => {
    it('convierte el precio a número y filtra por organización', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Cerveza',
          price: 55,
          category: { id: 'c1', name: 'Bebidas' },
        },
      ]);

      const result = await service.findAll(ORG);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG } }),
      );
      expect(result[0].price).toBe(55);
      expect(typeof result[0].price).toBe('number');
    });
  });

  describe('create', () => {
    it('lanza BadRequestException si la categoría no existe', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG, { categoryId: 'c1', name: 'X', price: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la categoría es de otra organización', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG, { categoryId: 'c1', name: 'X', price: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el producto con nombre recortado, activo por defecto y de la organización', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.product.create.mockResolvedValue({ id: 'p1' });

      await service.create(ORG, { categoryId: 'c1', name: '  X  ', price: 10 });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'X',
            price: 10,
            active: true,
            description: null,
            organizationId: ORG,
          }),
        }),
      );
    });

    it('lanza ConflictException si ya existe el nombre en la categoría', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.product.create.mockRejectedValue(uniqueError());

      await expect(
        service.create(ORG, { categoryId: 'c1', name: 'Cerveza', price: 55 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG, 'p1', { price: 60 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si se mueve a una categoría inexistente', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG, 'p1', { categoryId: 'zzz' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualiza el producto', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.product.update.mockResolvedValue({ id: 'p1' });

      await service.update(ORG, 'p1', {
        name: '  Nueva  ',
        price: 60,
        active: false,
      });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ name: 'Nueva', active: false }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('elimina el producto', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.product.delete.mockResolvedValue({ id: 'p1' });

      const result = await service.remove(ORG, 'p1');

      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG, 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
