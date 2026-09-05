import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  organizationId: string | null;
  role: {
    id: string;
    name: string;
    label: string;
  };
  permissions: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SECRET') ??
        'cambiar-esta-secreta-en-produccion',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

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
}
