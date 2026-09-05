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
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.categoriesService.findAll(organizationId);
  }

  @Post()
  @RequirePermissions('menu:manage')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('menu:manage')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('menu:manage')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.remove(organizationId, id);
  }
}
