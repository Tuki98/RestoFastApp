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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.productsService.findAll(organizationId);
  }

  @Post()
  @RequirePermissions('menu:manage')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('menu:manage')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('menu:manage')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.remove(organizationId, id);
  }
}
