import { Body, Controller, Get, Post } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { OrganizationsService } from './organizations.service';
import { VerifyUsersPanelPasswordDto } from './dto/verify-users-panel-password.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Datos de la org actual (límite de usuarios, plan) para el client. */
  @Get('current')
  getCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.organizations.getCurrent(organizationId);
  }

  /** Valida la contraseña de acceso a la gestión de usuarios de la org. */
  @Post('users-panel/verify')
  @RequirePermissions('users:manage')
  async verifyUsersPanelPassword(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: VerifyUsersPanelPasswordDto,
  ) {
    const ok = await this.organizations.verifyUsersPanelPassword(
      organizationId,
      dto.password,
    );
    if (!ok) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }
    return { ok: true };
  }
}
