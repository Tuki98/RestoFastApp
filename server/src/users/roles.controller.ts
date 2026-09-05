import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('roles:manage')
  findAll() {
    return this.prisma.role.findMany({
      where: { name: { not: 'SUPERADMIN' } },
      select: {
        id: true,
        name: true,
        label: true,
        permissions: {
          select: { permission: { select: { code: true } } },
          orderBy: { permission: { code: 'asc' } },
        },
      },
      orderBy: { label: 'asc' },
    });
  }
}
