import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { InventoryArea } from '../../generated/prisma/enums';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateExitDto } from './dto/create-exit.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('ingredients')
  @RequirePermissions('inventory:manage')
  findIngredients(
    @CurrentUser('organizationId') organizationId: string,
    @Query('area') area?: InventoryArea,
  ) {
    return this.inventoryService.findIngredients(organizationId, area);
  }

  @Post('ingredients')
  @RequirePermissions('inventory:manage')
  createIngredient(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateIngredientDto,
  ) {
    return this.inventoryService.createIngredient(organizationId, dto);
  }

  @Patch('ingredients/:id')
  @RequirePermissions('inventory:manage')
  updateIngredient(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.inventoryService.updateIngredient(organizationId, id, dto);
  }

  @Delete('ingredients/:id')
  @RequirePermissions('inventory:manage')
  removeIngredient(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.removeIngredient(organizationId, id);
  }

  @Post('ingredients/:id/entries')
  @RequirePermissions('inventory:manage')
  registerEntry(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.registerEntry(organizationId, id, dto, userId);
  }

  @Post('ingredients/:id/exits')
  @RequirePermissions('inventory:manage')
  registerExit(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExitDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.registerExit(organizationId, id, dto, userId);
  }

  @Get('alerts')
  @RequirePermissions('inventory:manage')
  getAlerts(@CurrentUser('organizationId') organizationId: string) {
    return this.inventoryService.getAlerts(organizationId);
  }

  @Get('movements')
  @RequirePermissions('inventory:manage')
  findMovements(
    @CurrentUser('organizationId') organizationId: string,
    @Query('ingredientId') ingredientId?: string,
    @Query('area') area?: InventoryArea,
  ) {
    return this.inventoryService.findMovements(organizationId, ingredientId, area);
  }
}
