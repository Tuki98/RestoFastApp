import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const ROLE = {
  id: 'r1',
  name: 'ADMIN',
  label: 'Administrador',
  permissions: [{ permission: { code: 'users:manage' } }],
};

function buildUser(
  passwordHash: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'u1',
    name: 'Admin',
    email: 'admin@restobar.pe',
    active: true,
    passwordHash,
    role: ROLE,
    ...overrides,
  };
}

describe('AuthService', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    role: { findUnique: jest.fn() },
    organization: { create: jest.fn() },
  };
  const jwt = { sign: jest.fn(() => 'signed-token') };
  const organizations = {
    generateUniqueSlug: jest.fn(async () => 'mi-negocio'),
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      organizations as never,
    );
  });

  describe('login', () => {
    it('devuelve token y usuario para credenciales correctas', async () => {
      const hash = await bcrypt.hash('admin123', 4);
      prisma.user.findFirst.mockResolvedValue(buildUser(hash));

      const result = await service.login({
        email: 'Admin@restobar.pe',
        password: 'admin123',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'admin@restobar.pe' },
        }),
      );
      expect(result.accessToken).toBe('signed-token');
      expect(result.user.email).toBe('admin@restobar.pe');
      expect(result.user.permissions).toEqual(['users:manage']);
    });

    it('lanza UnauthorizedException con contraseña incorrecta', async () => {
      const hash = await bcrypt.hash('admin123', 4);
      prisma.user.findFirst.mockResolvedValue(buildUser(hash));

      await expect(
        service.login({ email: 'admin@restobar.pe', password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nadie@restobar.pe', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      const hash = await bcrypt.hash('admin123', 4);
      prisma.user.findFirst.mockResolvedValue(
        buildUser(hash, { active: false }),
      );

      await expect(
        service.login({ email: 'admin@restobar.pe', password: 'admin123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('devuelve el usuario autenticado', async () => {
      const hash = await bcrypt.hash('admin123', 4);
      prisma.user.findFirst.mockResolvedValue(buildUser(hash));

      const result = await service.me('u1');

      expect(result.id).toBe('u1');
      expect(result.role.name).toBe('ADMIN');
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.me('u1')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      const hash = await bcrypt.hash('admin123', 4);
      prisma.user.findFirst.mockResolvedValue(
        buildUser(hash, { active: false }),
      );

      await expect(service.me('u1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    const dto = {
      name: '  Ana  ',
      email: '  Ana@Resto.pe ',
      password: 'secreto123',
      organizationName: '  Mi Negocio  ',
    };

    it('crea la org en TRIAL con límite por defecto y el admin', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'ADMIN' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1' });
      prisma.user.create.mockResolvedValue(
        buildUser('hash', {
          id: 'u1',
          organizationId: 'org-1',
          email: 'ana@resto.pe',
        }),
      );

      const result = await service.register(dto);

      expect(organizations.generateUniqueSlug).toHaveBeenCalledWith(
        'Mi Negocio',
      );
      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Mi Negocio',
            plan: 'TRIAL',
            maxUsers: 5,
          }),
        }),
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ana@resto.pe',
            organizationId: 'org-1',
          }),
        }),
      );
      expect(result.accessToken).toBe('signed-token');
      expect(result.user.email).toBe('ana@resto.pe');
    });

    it('lanza ConflictException si el correo ya está registrado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u9' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });
});
