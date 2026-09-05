import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CashService } from './cash.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';

@Controller('cash-sessions')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get('current')
  @RequirePermissions('caja:manage')
  getCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.cashService.getCurrent(organizationId);
  }

  @Get()
  @RequirePermissions('caja:manage')
  getHistory(@CurrentUser('organizationId') organizationId: string) {
    return this.cashService.getHistory(organizationId);
  }

  @Post('open')
  @RequirePermissions('caja:manage')
  open(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OpenCashDto,
  ) {
    return this.cashService.open(organizationId, userId, dto);
  }

  @Post(':id/close')
  @RequirePermissions('caja:manage')
  close(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashDto,
  ) {
    return this.cashService.close(organizationId, userId, id, dto);
  }
}
