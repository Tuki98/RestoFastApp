import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.tablesService.findAll(organizationId);
  }

  @Public()
  @Get('by-token/:token')
  findByToken(@Param('token') token: string) {
    return this.tablesService.findByToken(token);
  }

  @Post()
  @RequirePermissions('tables:manage')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateTableDto,
  ) {
    return this.tablesService.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('tables:manage')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.update(organizationId, id, dto);
  }

  @Patch(':id/free')
  @RequirePermissions('tables:manage')
  free(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tablesService.freeTable(organizationId, id);
  }

  @Delete(':id')
  @RequirePermissions('tables:manage')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tablesService.remove(organizationId, id);
  }
}
