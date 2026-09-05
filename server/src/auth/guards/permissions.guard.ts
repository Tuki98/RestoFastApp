import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../jwt.strategy';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!required || required.length === 0) &&
      (!requiredAny || requiredAny.length === 0)
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('No autorizado');
    }

    if (required?.length) {
      const hasAll = required.every((permission) =>
        user.permissions.includes(permission),
      );
      if (!hasAll) {
        throw new ForbiddenException(
          'No tienes permisos suficientes para realizar esta acción',
        );
      }
    }

    if (requiredAny?.length) {
      const hasAny = requiredAny.some((permission) =>
        user.permissions.includes(permission),
      );
      if (!hasAny) {
        throw new ForbiddenException(
          'No tienes permisos suficientes para realizar esta acción',
        );
      }
    }

    return true;
  }
}
