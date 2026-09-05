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
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { UsersService } from '../users/users.service';

@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @RequirePermissions('system:manage')
  findAll() {
    return this.organizations.findAll();
  }

  @Post()
  @RequirePermissions('system:manage')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizations.createAdminOrg(dto);
  }

  @Patch(':id')
  @RequirePermissions('system:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(id, dto);
  }

  @Get(':id/users')
  @RequirePermissions('system:manage')
  getUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findAll(id);
  }

  @Post(':id/users')
  @RequirePermissions('system:manage')
  createUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.users.create(id, dto);
  }

  @Patch(':id/users/:userId')
  @RequirePermissions('system:manage')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.users.update(id, userId, dto, actorId);
  }

  @Patch(':id/users/:userId/status')
  @RequirePermissions('system:manage')
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.users.updateStatus(id, userId, dto, actorId);
  }
}
