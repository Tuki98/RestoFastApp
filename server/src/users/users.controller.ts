import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:manage')
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.usersService.findAll(organizationId);
  }

  @Post()
  @RequirePermissions('users:manage')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('users:manage')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.update(organizationId, id, dto, actorId);
  }

  @Patch(':id/status')
  @RequirePermissions('users:manage')
  updateStatus(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.updateStatus(organizationId, id, dto, actorId);
  }
}
