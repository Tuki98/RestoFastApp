import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';

@Module({
  controllers: [CategoriesController, ProductsController, PublicMenuController],
  providers: [CategoriesService, ProductsService, PublicMenuService],
})
export class MenuModule {}
