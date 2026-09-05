import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { DEFAULT_ORG_MAX_USERS } from '../organizations/organizations.service';
import type { AuthUser, JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type UserWithRole = NonNullable<
  Awaited<ReturnType<PrismaService['user']['findUnique']>>
> & {
  role: {
    id: string;
    name: string;
    label: string;
    permissions: { permission: { code: string } }[];
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly organizations: OrganizationsService,
  ) {}

  // Coste consistente para evitar enumeración de usuarios por tiempos de respuesta.
  private readonly DUMMY_HASH =
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findUserWithRole(email);

    if (!user || !user.active) {
      await bcrypt.compare(dto.password, this.DUMMY_HASH);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.findUserWithRole(undefined, userId);
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    return this.toAuthUser(user);
  }

  /** Alta de un nuevo negocio: crea su organización y el usuario administrador. */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const organizationName = dto.organizationName.trim();

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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const org = await this.prisma.organization.create({
      data: {
        name: organizationName,
        slug: await this.organizations.generateUniqueSlug(organizationName),
        plan: 'TRIAL',
        trialEndsAt: new Date(Date.now() + REGISTER_TRIAL_DAYS * DAY_MS),
        maxUsers: DEFAULT_ORG_MAX_USERS,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roleId: adminRole.id,
        organizationId: org.id,
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    return this.buildAuthResponse(user);
  }

  private async findUserWithRole(email?: string, id?: string) {
    return this.prisma.user.findFirst({
      where: email ? { email } : { id },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      organizationId: user.organizationId,
      role: {
        id: user.role.id,
        name: user.role.name,
        label: user.role.label,
      },
      permissions: user.role.permissions.map((rp) => rp.permission.code),
    };
  }

  private buildAuthResponse(user: UserWithRole) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: this.toAuthUser(user),
    };
  }
}

export const REGISTER_TRIAL_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
