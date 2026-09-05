import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ReportsService } from './reports.service';
import {
  ReportsRangeDto,
  TopProductsQueryDto,
  TrendQueryDto,
} from './dto/reports.dto';

@Controller('reports')
@RequirePermissions('reports:view')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: ReportsRangeDto,
  ) {
    return this.reportsService.summary(organizationId, dto);
  }

  @Get('sales-trend')
  salesTrend(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: TrendQueryDto,
  ) {
    return this.reportsService.salesTrend(organizationId, dto);
  }

  @Get('top-products')
  topProducts(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: TopProductsQueryDto,
  ) {
    return this.reportsService.topProducts(organizationId, dto);
  }

  @Get('service')
  service(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: ReportsRangeDto,
  ) {
    return this.reportsService.serviceReport(organizationId, dto);
  }

  @Get('cash-sessions')
  cashSessions(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: ReportsRangeDto,
  ) {
    return this.reportsService.cashReport(organizationId, dto);
  }

  @Get('inventory')
  inventory(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: ReportsRangeDto,
  ) {
    return this.reportsService.inventoryReport(organizationId, dto);
  }

  @Get('export')
  async export(
    @CurrentUser('organizationId') organizationId: string,
    @Query() dto: ReportsRangeDto,
  ) {
    const buffer = await this.reportsService.export(organizationId, dto);
    const filename = `reporte-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
