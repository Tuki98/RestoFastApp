import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { PayOrderDto } from './dto/pay-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';

const ANY_ORDER_VIEW = [
  'orders:create',
  'orders:update',
  'orders:pay',
  'kitchen:view',
];

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequireAnyPermissions(...ANY_ORDER_VIEW)
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query('status') status?: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.ordersService.findAll(organizationId, { status, tableId });
  }

  @Get('open-by-table/:tableId')
  @RequireAnyPermissions(...ANY_ORDER_VIEW)
  findOpenByTable(
    @CurrentUser('organizationId') organizationId: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    return this.ordersService.findOpenByTable(organizationId, tableId);
  }

  @Get(':id')
  @RequireAnyPermissions(...ANY_ORDER_VIEW)
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOne(organizationId, id);
  }

  @Post()
  @RequirePermissions('orders:create')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(organizationId, userId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('orders:update')
  updateStatus(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.updateStatus(organizationId, id, dto, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders:cancel')
  cancel(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.cancel(organizationId, id, userId);
  }

  @Post(':id/pay')
  @RequirePermissions('orders:pay')
  pay(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.pay(organizationId, id, dto, userId);
  }

  @Post(':id/items')
  @RequirePermissions('orders:update')
  addItems(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemsDto,
  ) {
    return this.ordersService.addItems(organizationId, id, dto);
  }
}
