import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicMenuService } from './public-menu.service';
import { PublicCreateOrderDto } from './dto/public-create-order.dto';

@Controller('public/menu')
export class PublicMenuController {
  constructor(private readonly publicMenuService: PublicMenuService) {}

  @Public()
  @Get(':qrToken')
  findByTableToken(@Param('qrToken') token: string) {
    return this.publicMenuService.findByTableToken(token);
  }

  @Public()
  @Post(':qrToken/occupy')
  occupy(@Param('qrToken') token: string) {
    return this.publicMenuService.occupyByTableToken(token);
  }

  @Public()
  @Post(':qrToken/orders')
  createOrder(
    @Param('qrToken') token: string,
    @Body() dto: PublicCreateOrderDto,
  ) {
    return this.publicMenuService.createOrderForTable(token, dto);
  }

  @Public()
  @Get(':qrToken/orders/:customerToken')
  orderStatus(
    @Param('qrToken') token: string,
    @Param('customerToken') customerToken: string,
  ) {
    return this.publicMenuService.getOrderStatusForCustomer(
      token,
      customerToken,
    );
  }
}
