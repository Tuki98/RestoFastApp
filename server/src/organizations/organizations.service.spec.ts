import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { OrganizationsService } from './organizations.service';

jest.mock('bcryptjs', () => ({
  __esModule: true,
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('OrganizationsService', () => {
  const prisma = {
    organization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    role: { findUnique: jest.fn() },
  };
  let service: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationsService(prisma as never);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('findAll', () => {
    it('mapea conteos y maxUsers', async () => {
      prisma.organization.findMany.mockResolvedValue([
        {
          id: 'o1',
          name: 'Org',
          slug: 'org',
          plan: 'TRIAL',
          trialEndsAt: null,
          maxUsers: 5,
          usersPanelPasswordHash: 'hash',
          createdAt: new Date(),
          _count: { users: 3, orders: 10, cashSessions: 2 },
        },
      ]);

      const result = await service.findAll();

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'o1',
          maxUsers: 5,
          hasUsersPanelPassword: true,
          usersCount: 3,
          ordersCount: 10,
          cashSessionsCount: 2,
        }),
      );
    });
  });

  describe('getCurrent', () => {
    it('devuelve datos de la org', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'o1',
        name: 'Org',
        slug: 'org',
        plan: 'TRIAL',
        trialEndsAt: null,
        maxUsers: 5,
        usersPanelPasswordHash: null,
        _count: { users: 2 },
      });

      const result = await service.getCurrent('o1');

      expect(result.maxUsers).toBe(5);
      expect(result.usersCount).toBe(2);
      expect(result.hasUsersPanelPassword).toBe(false);
    });

    it('lanza NotFoundException si la org no existe', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getCurrent('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createAdminOrg', () => {
    const dto = {
      organizationName: '  Mi Bar  ',
      adminName: '  Ana  ',
      adminEmail: '  ana@resto.pe ',
      adminPassword: 'secreto123',
      usersPanelPassword: 'panel1234',
    };

    it('crea org con slug, límite por defecto y hash del panel, y al admin', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'ADMIN' });
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Mi Bar',
        slug: 'mi-bar',
        plan: 'TRIAL',
        maxUsers: 5,
        usersPanelPasswordHash: 'hashed',
      });
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Mi Bar',
        slug: 'mi-bar',
        plan: 'TRIAL',
        trialEndsAt: null,
        maxUsers: 5,
        usersPanelPasswordHash: 'hashed',
        createdAt: new Date(),
        _count: { users: 1, orders: 0, cashSessions: 0 },
      });

      await service.createAdminOrg(dto);

      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Mi Bar',
            maxUsers: 5,
            usersPanelPasswordHash: 'hashed',
          }),
        }),
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ana@resto.pe',
            roleId: 'r1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('lanza ConflictException si el correo del admin ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u9' });

      await expect(service.createAdminOrg(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('actualiza plan, límite y resetea la contraseña del panel', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'o1',
        name: 'Org',
        slug: 'org',
        plan: 'TRIAL',
        trialEndsAt: null,
        maxUsers: 5,
        usersPanelPasswordHash: 'hashed',
        createdAt: new Date(),
        _count: { users: 1, orders: 0, cashSessions: 0 },
      });
      prisma.organization.update.mockResolvedValue({ id: 'o1' });

      await service.update('o1', {
        maxUsers: 10,
        plan: 'ACTIVE',
        usersPanelPassword: 'nueva1234',
      });

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o1' },
          data: expect.objectContaining({
            maxUsers: 10,
            plan: 'ACTIVE',
            usersPanelPasswordHash: 'hashed',
          }),
        }),
      );
    });

    it('lanza NotFoundException si la org no existe', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { plan: 'ACTIVE' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyUsersPanelPassword', () => {
    it('devuelve true con contraseña correcta', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'o1',
        usersPanelPasswordHash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.verifyUsersPanelPassword('o1', 'ok123'),
      ).resolves.toBe(true);
    });

    it('devuelve false si la org no tiene contraseña configurada', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'o1',
        usersPanelPasswordHash: null,
      });

      await expect(service.verifyUsersPanelPassword('o1', 'x')).resolves.toBe(
        false,
      );
    });
  });
});
