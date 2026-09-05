import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { RoleName } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  role: { select: { id: true, name: true, label: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();

    await this.assertEmailAvailable(email);
    await this.assertWithinUserLimit(organizationId);

    const role = await this.getRoleOrThrow(dto.roleId);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roleId: role.id,
        organizationId,
      },
      select: USER_SELECT,
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ) {
    const user = await this.getUserOrThrow(id, organizationId);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      await this.assertEmailAvailable(dto.email);
    }

    if (dto.roleId && dto.roleId !== user.roleId) {
      const role = await this.getRoleOrThrow(dto.roleId);

      if (id === actorId) {
        throw new BadRequestException(
          'No puedes cambiar tu propio rol de acceso',
        );
      }

      const currentRoleName = await this.getRoleName(user.roleId);
      if (
        user.active &&
        currentRoleName === RoleName.ADMIN &&
        role.name !== RoleName.ADMIN &&
        (await this.isLastActiveAdmin(user.roleId, organizationId))
      ) {
        throw new BadRequestException(
          'No se puede cambiar el rol del último administrador activo',
        );
      }
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: dto.email?.trim().toLowerCase(),
        roleId: dto.roleId,
        passwordHash,
      },
      select: USER_SELECT,
    });
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateUserStatusDto,
    actorId: string,
  ) {
    const user = await this.getUserOrThrow(id, organizationId);

    if (!dto.active && id === actorId) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }

    if (dto.active) {
      await this.assertWithinUserLimit(organizationId);
    }

    const roleName = await this.getRoleName(user.roleId);
    if (
      !dto.active &&
      user.active &&
      roleName === RoleName.ADMIN &&
      (await this.isLastActiveAdmin(user.roleId, organizationId))
    ) {
      throw new BadRequestException(
        'No se puede desactivar al último administrador activo',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { active: dto.active },
      select: USER_SELECT,
    });
  }

  private async assertEmailAvailable(email: string) {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }
  }

  /** Bloquea crear/reactivar usuarios cuando la org alcanza su límite. */
  private async assertWithinUserLimit(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org || org.maxUsers == null) {
      return;
    }
    const count = await this.prisma.user.count({
      where: { organizationId },
    });
    if (count >= org.maxUsers) {
      throw new ConflictException(
        `Límite de usuarios alcanzado (${org.maxUsers}). Comunícate con el administrador para ampliar la capacidad.`,
      );
    }
  }

  private async getRoleOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException('El rol no existe');
    }
    return role;
  }

  private async getUserOrThrow(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  private async getRoleName(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name;
  }

  private async isLastActiveAdmin(roleId: string, organizationId: string) {
    const count = await this.prisma.user.count({
      where: { active: true, roleId, organizationId },
    });
    return count <= 1;
  }
}
