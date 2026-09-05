import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

const ORG = 'org-1';

jest.mock('bcryptjs', () => ({
  __esModule: true,
  hash: jest.fn(),
}));

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    role: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma as never);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    prisma.organization.findUnique.mockResolvedValue({
      id: ORG,
      maxUsers: null,
    });
  });

  describe('create', () => {
    it('normaliza email y nombre, hashea la contraseña y liga a la organización', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'MESERO' });
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        name: 'Mesero',
        email: 'mesero@restobar.pe',
      });
      const result = await service.create(ORG, {
        name: '  Mesero  ',
        email: '  Mesero@restobar.pe ',
        password: 'secreto',
        roleId: 'r1',
      });

      expect(result.email).toBe('mesero@restobar.pe');
      expect(result.name).toBe('Mesero');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'mesero@restobar.pe',
            passwordHash: 'hashed',
            organizationId: ORG,
          }),
        }),
      );
    });

    it('lanza ConflictException si el correo ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u9' });

      await expect(
        service.create(ORG, {
          name: 'X',
          email: 'mesero@restobar.pe',
          password: 'secreto',
          roleId: 'r1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza BadRequestException si el rol no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.create(ORG, {
          name: 'X',
          email: 'nuevo@restobar.pe',
          password: 'secreto',
          roleId: 'r1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('límite de usuarios', () => {
    it('bloquea la creación cuando la org alcanza su límite', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({
        id: ORG,
        maxUsers: 2,
      });
      prisma.user.count.mockResolvedValue(2);

      await expect(
        service.create(ORG, {
          name: 'X',
          email: 'nuevo@restobar.pe',
          password: 'secreto',
          roleId: 'r1',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { organizationId: ORG },
      });
    });

    it('permite crear mientras haya espacio en el límite', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({
        id: ORG,
        maxUsers: 3,
      });
      prisma.user.count.mockResolvedValue(2);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'MESERO' });
      prisma.user.create.mockResolvedValue({ id: 'u1' });

      await expect(
        service.create(ORG, {
          name: 'X',
          email: 'nuevo@restobar.pe',
          password: 'secreto',
          roleId: 'r1',
        }),
      ).resolves.toBeDefined();
    });

    it('no aplica límite si maxUsers es null (ilimitado)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.count.mockResolvedValue(500);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'MESERO' });
      prisma.user.create.mockResolvedValue({ id: 'u1' });

      await expect(
        service.create(ORG, {
          name: 'X',
          email: 'nuevo@restobar.pe',
          password: 'secreto',
          roleId: 'r1',
        }),
      ).resolves.toBeDefined();
    });

    it('bloquea reactivar un usuario cuando la org está al límite', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        roleId: 'r1',
        active: false,
      });
      prisma.organization.findUnique.mockResolvedValue({
        id: ORG,
        maxUsers: 2,
      });
      prisma.user.count.mockResolvedValue(2);

      await expect(
        service.updateStatus(ORG, 'u1', { active: true }, 'actor'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('no expone passwordHash y filtra por organización', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      const result = await service.findAll(ORG);

      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG },
          select: expect.not.objectContaining({
            passwordHash: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si el usuario no existe o es de otra organización', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG, 'u1', { name: 'X' }, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el correo ya está en uso por otro usuario', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'uno@restobar.pe',
        roleId: 'r1',
        active: true,
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' });

      await expect(
        service.update(ORG, 'u1', { email: 'otro@restobar.pe' }, 'actor'),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza cambiar tu propio rol', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'u@restobar.pe',
        roleId: 'r1',
        active: true,
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r2', name: 'CAJA' });

      await expect(
        service.update(ORG, 'u1', { roleId: 'r2' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza quitar el rol de administrador al último admin activo de la org', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'admin@restobar.pe',
        roleId: 'rAdmin',
        active: true,
      });
      prisma.role.findUnique.mockResolvedValueOnce({
        id: 'rMesero',
        name: 'MESERO',
      });
      prisma.role.findUnique.mockResolvedValueOnce({
        id: 'rAdmin',
        name: 'ADMIN',
      });
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.update(ORG, 'u1', { roleId: 'rMesero' }, 'actor'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, roleId: 'rAdmin', organizationId: ORG },
        }),
      );
    });

    it('actualiza datos y hashea la nueva contraseña', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'u@restobar.pe',
        roleId: 'r1',
        active: true,
      });
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await service.update(
        ORG,
        'u1',
        { name: '  Nuevo  ', password: 'nueva123' },
        'actor',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            name: 'Nuevo',
            passwordHash: 'hashed',
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('lanza NotFoundException si no existe', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(ORG, 'u1', { active: false }, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza desactivar tu propia cuenta', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        roleId: 'r1',
        active: true,
      });

      await expect(
        service.updateStatus(ORG, 'u1', { active: false }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza desactivar al último administrador activo', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        roleId: 'rAdmin',
        active: true,
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'rAdmin', name: 'ADMIN' });
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.updateStatus(ORG, 'u1', { active: false }, 'actor'),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite desactivar si hay otro admin activo', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        roleId: 'rAdmin',
        active: true,
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'rAdmin', name: 'ADMIN' });
      prisma.user.count.mockResolvedValue(2);
      prisma.user.update.mockResolvedValue({ id: 'u1', active: false });

      await service.updateStatus(ORG, 'u1', { active: false }, 'actor');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { active: false },
        select: expect.anything(),
      });
    });
  });
});
