import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OrgPlan } from '../../generated/prisma/enums';
import { CreateOrganizationDto } from '../admin/dto/create-organization.dto';
import { UpdateOrganizationDto } from '../admin/dto/update-organization.dto';

export const DEMO_ORG_SLUG = 'restobar';
export const DEFAULT_ORG_MAX_USERS = 5;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Organización de demostración: adopta la data del seed y de los menús públicos. */
  findDefault() {
    return this.prisma.organization.findUnique({
      where: { slug: DEMO_ORG_SLUG },
    });
  }

  async findAll() {
    const organizations = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true, orders: true, cashSessions: true } },
      },
    });

    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      trialEndsAt: org.trialEndsAt,
      maxUsers: org.maxUsers,
      hasUsersPanelPassword: Boolean(org.usersPanelPasswordHash),
      createdAt: org.createdAt,
      usersCount: org._count.users,
      ordersCount: org._count.orders,
      cashSessionsCount: org._count.cashSessions,
    }));
  }

  /** Datos de la org actual (para la barra de límite de usuarios del client). */
  async getCurrent(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { users: true } } },
    });
    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      trialEndsAt: org.trialEndsAt,
      maxUsers: org.maxUsers,
      usersCount: org._count.users,
      hasUsersPanelPassword: Boolean(org.usersPanelPasswordHash),
    };
  }

  /** Alta de una organización por el operador: org + usuario admin + contraseña del panel. */
  async createAdminOrg(dto: CreateOrganizationDto) {
    const email = dto.adminEmail.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });
    if (!adminRole) {
      throw new InternalServerErrorException(
        'Configuración incompleta: no existe el rol de administrador',
      );
    }

    const adminPasswordHash = await bcrypt.hash(dto.adminPassword, 10);
    const panelHash = await bcrypt.hash(dto.usersPanelPassword, 10);

    const org = await this.prisma.organization.create({
      data: {
        name: dto.organizationName.trim(),
        slug: await this.generateUniqueSlug(dto.organizationName),
        plan: dto.plan ?? OrgPlan.TRIAL,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
        maxUsers: dto.maxUsers ?? DEFAULT_ORG_MAX_USERS,
        usersPanelPasswordHash: panelHash,
      },
    });

    await this.prisma.user.create({
      data: {
        name: dto.adminName.trim(),
        email,
        passwordHash: adminPasswordHash,
        roleId: adminRole.id,
        organizationId: org.id,
      },
    });

    return this.findById(org.id);
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }

    await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        plan: dto.plan,
        maxUsers: dto.maxUsers === undefined ? undefined : dto.maxUsers,
        trialEndsAt:
          dto.trialEndsAt === null
            ? null
            : dto.trialEndsAt
              ? new Date(dto.trialEndsAt)
              : undefined,
        usersPanelPasswordHash: dto.usersPanelPassword
          ? await bcrypt.hash(dto.usersPanelPassword, 10)
          : undefined,
      },
    });

    return this.findById(id);
  }

  /** Valida la contraseña de gestión de usuarios de una organización. */
  async verifyUsersPanelPassword(organizationId: string, password: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org || !org.usersPanelPasswordHash) {
      return false;
    }
    return bcrypt.compare(password, org.usersPanelPasswordHash);
  }

  slugBase(name: string): string {
    return (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'negocio'
    );
  }

  async generateUniqueSlug(name: string): Promise<string> {
    const base = this.slugBase(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate =
        attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      const existing = await this.prisma.organization.findUnique({
        where: { slug: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, orders: true, cashSessions: true } },
      },
    });
    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      trialEndsAt: org.trialEndsAt,
      maxUsers: org.maxUsers,
      hasUsersPanelPassword: Boolean(org.usersPanelPasswordHash),
      createdAt: org.createdAt,
      usersCount: org._count.users,
      ordersCount: org._count.orders,
      cashSessionsCount: org._count.cashSessions,
    };
  }
}
