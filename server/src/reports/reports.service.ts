import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  OrderStatus,
  PaymentMethod,
} from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportsRangeDto,
  TopProductsQueryDto,
  TrendQueryDto,
} from './dto/reports.dto';

const ORDER_TYPES = ['DINE_IN', 'TAKEOUT'] as const;
const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'YAPE_PLIN'];
const MONEY_FORMAT = '#,##0.00';
const NUMBER_FORMAT = '#,##0';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

interface ResolvedRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

interface RangeInput {
  from?: string;
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Resumen ----------

  async summary(organizationId: string, dto: ReportsRangeDto) {
    const { from, to, prevFrom, prevTo } = this.resolveRange(dto);
    const range = { gte: from, lte: to };

    const [paidOrders, payments, cancelled, prevPaid] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId, status: 'PAID', paidAt: range },
        select: { total: true, orderType: true },
      }),
      this.prisma.payment.findMany({
        where: { order: { organizationId }, paidAt: range },
        select: { method: true, amount: true },
      }),
      this.prisma.order.findMany({
        where: { organizationId, status: 'CANCELLED', updatedAt: range },
        select: { total: true },
      }),
      this.prisma.order.findMany({
        where: {
          organizationId,
          status: 'PAID',
          paidAt: { gte: prevFrom, lte: prevTo },
        },
        select: { total: true },
      }),
    ]);

    const revenue = round2(
      paidOrders.reduce((sum, o) => sum + Number(o.total), 0),
    );
    const ordersCount = paidOrders.length;
    const cancelledAmount = round2(
      cancelled.reduce((sum, o) => sum + Number(o.total), 0),
    );

    const byPaymentMethod = PAYMENT_METHODS.map((method) => {
      const entries = payments.filter((p) => p.method === method);
      return {
        method,
        amount: round2(entries.reduce((s, p) => s + Number(p.amount), 0)),
        count: entries.length,
      };
    });

    const byOrderType = ORDER_TYPES.map((type) => {
      const entries = paidOrders.filter((o) => o.orderType === type);
      return {
        type,
        amount: round2(entries.reduce((s, o) => s + Number(o.total), 0)),
        count: entries.length,
      };
    });

    const prevRevenue = round2(
      prevPaid.reduce((sum, o) => sum + Number(o.total), 0),
    );
    const prevOrdersCount = prevPaid.length;
    const prevAvgTicket = prevOrdersCount ? prevRevenue / prevOrdersCount : 0;
    const avgTicket = ordersCount ? revenue / ordersCount : 0;

    return {
      range: this.serializeRange({ from, to }),
      revenue,
      ordersCount,
      avgTicket: round2(avgTicket),
      cancelledCount: cancelled.length,
      cancelledAmount,
      prevRevenue,
      revenueDeltaPct:
        prevRevenue > 0 ? round2(((revenue - prevRevenue) / prevRevenue) * 100) : null,
      prevOrdersCount,
      avgTicketDeltaPct:
        prevAvgTicket > 0
          ? round2(((avgTicket - prevAvgTicket) / prevAvgTicket) * 100)
          : null,
      byPaymentMethod,
      byOrderType,
    };
  }

  // ---------- Tendencias ----------

  async salesTrend(organizationId: string, dto: TrendQueryDto) {
    const { from, to } = this.resolveRange(dto);
    const granularity = dto.granularity ?? 'day';

    const paid = await this.prisma.order.findMany({
      where: { organizationId, status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { total: true, paidAt: true },
    });

    const buckets = new Map<string, { revenue: number; orders: number }>();
    const byDayOfWeek = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
      day,
      revenue: 0,
      orders: 0,
    }));
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: 0,
      orders: 0,
    }));

    for (const order of paid) {
      const total = Number(order.total);
      const date = new Date(order.paidAt as Date);

      const key = this.periodKey(date, granularity);
      const bucket = buckets.get(key) ?? { revenue: 0, orders: 0 };
      bucket.revenue = round2(bucket.revenue + total);
      bucket.orders += 1;
      buckets.set(key, bucket);

      const dow = date.getDay() === 0 ? 7 : date.getDay();
      byDayOfWeek[dow - 1].revenue = round2(byDayOfWeek[dow - 1].revenue + total);
      byDayOfWeek[dow - 1].orders += 1;

      byHour[date.getHours()].revenue = round2(
        byHour[date.getHours()].revenue + total,
      );
      byHour[date.getHours()].orders += 1;
    }

    const series = [...buckets.entries()]
      .map(([period, value]) => ({ period, ...value }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      range: this.serializeRange({ from, to }),
      granularity,
      series,
      byDayOfWeek,
      byHour,
    };
  }

  // ---------- Productos ----------

  async topProducts(organizationId: string, dto: TopProductsQueryDto) {
    const { from, to } = this.resolveRange(dto);
    const limit = dto.limit ?? 10;

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          organizationId,
          status: 'PAID',
          paidAt: { gte: from, lte: to },
        },
      },
      select: {
        productId: true,
        productName: true,
        unitPrice: true,
        quantity: true,
        product: {
          select: { category: { select: { name: true } } },
        },
      },
    });

    const products = new Map<
      string,
      {
        productId: string | null;
        productName: string;
        category: string;
        quantity: number;
        revenue: number;
      }
    >();
    const categories = new Map<string, { quantity: number; revenue: number }>();

    for (const item of items) {
      const key = item.productId ?? `manual::${item.productName}`;
      const category = item.product?.category?.name ?? 'Sin categoría';
      const revenue = Number(item.unitPrice) * item.quantity;

      const product = products.get(key) ?? {
        productId: item.productId,
        productName: item.productName,
        category,
        quantity: 0,
        revenue: 0,
      };
      product.quantity += item.quantity;
      product.revenue = round2(product.revenue + revenue);
      products.set(key, product);

      const categoryEntry = categories.get(category) ?? {
        quantity: 0,
        revenue: 0,
      };
      categoryEntry.quantity += item.quantity;
      categoryEntry.revenue = round2(categoryEntry.revenue + revenue);
      categories.set(category, categoryEntry);
    }

    const ranked = [...products.values()].sort(
      (a, b) => b.revenue - a.revenue || b.quantity - a.quantity,
    );
    const totalRevenue = ranked.reduce((sum, p) => sum + p.revenue, 0);
    const byCategory = [...categories.entries()]
      .map(([name, value]) => ({
        category: name,
        quantity: value.quantity,
        revenue: value.revenue,
        share: totalRevenue ? round2((value.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      range: this.serializeRange({ from, to }),
      top: ranked.slice(0, limit),
      bottom: [...ranked].reverse().slice(0, limit),
      byCategory,
    };
  }

  // ---------- Servicio ----------

  async serviceReport(organizationId: string, dto: ReportsRangeDto) {
    const { from, to } = this.resolveRange(dto);

    const [orders, totalTables] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId, status: 'PAID', paidAt: { gte: from, lte: to } },
        select: {
          id: true,
          orderType: true,
          createdAt: true,
          paidAt: true,
          total: true,
          table: { select: { number: true, section: true } },
          createdBy: { select: { id: true, name: true } },
          statusHistory: {
            select: { status: true, changedAt: true },
            orderBy: { changedAt: 'asc' },
          },
        },
      }),
      this.prisma.restaurantTable.count({ where: { organizationId } }),
    ]);

    let kitchenMs = 0;
    let kitchenCount = 0;
    let totalMs = 0;
    let totalCount = 0;
    let dineInCount = 0;
    let dineInMs = 0;

    const waiters = new Map<
      string,
      { userId: string | null; name: string; orders: number; revenue: number }
    >();
    const tables = new Map<
      string,
      { number: number; section: string; orders: number; revenue: number }
    >();

    for (const order of orders) {
      const createdMs = new Date(order.createdAt).getTime();
      const paidMs = new Date(order.paidAt as Date).getTime();

      const served = order.statusHistory.find((h) => h.status === 'SERVED');
      const servedMs = served
        ? new Date(served.changedAt).getTime()
        : paidMs;
      if (servedMs > createdMs) {
        totalMs += servedMs - createdMs;
        totalCount += 1;
      }

      const pending = order.statusHistory.find((h) => h.status === 'PENDING');
      const ready = order.statusHistory.find((h) => h.status === 'READY');
      if (pending && ready) {
        const pendingMs = new Date(pending.changedAt).getTime();
        const readyMs = new Date(ready.changedAt).getTime();
        if (readyMs > pendingMs) {
          kitchenMs += readyMs - pendingMs;
          kitchenCount += 1;
        }
      }

      const waiterKey = order.createdBy?.id ?? 'anon';
      const waiter = waiters.get(waiterKey) ?? {
        userId: order.createdBy?.id ?? null,
        name: order.createdBy?.name ?? 'Sin mesero',
        orders: 0,
        revenue: 0,
      };
      waiter.orders += 1;
      waiter.revenue = round2(waiter.revenue + Number(order.total));
      waiters.set(waiterKey, waiter);

      if (order.table) {
        const tableKey = String(order.table.number);
        const table = tables.get(tableKey) ?? {
          number: order.table.number,
          section: order.table.section,
          orders: 0,
          revenue: 0,
        };
        table.orders += 1;
        table.revenue = round2(table.revenue + Number(order.total));
        tables.set(tableKey, table);
      }

      if (order.orderType === 'DINE_IN') {
        dineInCount += 1;
        dineInMs += Math.max(0, paidMs - createdMs);
      }
    }

    const occupied = tables.size;

    return {
      range: this.serializeRange({ from, to }),
      serviceTimes: {
        avgKitchenMs: kitchenCount ? Math.round(kitchenMs / kitchenCount) : null,
        avgTotalMs: totalCount ? Math.round(totalMs / totalCount) : null,
      },
      byWaiter: [...waiters.values()].sort((a, b) => b.revenue - a.revenue),
      tables: {
        total: totalTables,
        occupied,
        utilization: totalTables ? round2((occupied / totalTables) * 100) : 0,
        avgOrdersPerTable: occupied ? round2(dineInCount / occupied) : 0,
        avgDineInDurationMs: dineInCount ? Math.round(dineInMs / dineInCount) : null,
        ranking: [...tables.values()].sort((a, b) => b.revenue - a.revenue),
      },
    };
  }

  // ---------- Caja ----------

  async cashReport(organizationId: string, dto: ReportsRangeDto) {
    const { from, to } = this.resolveRange(dto);

    const sessions = await this.prisma.cashSession.findMany({
      where: { organizationId, closedAt: { gte: from, lte: to } },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: { closedAt: 'desc' },
    });

    return {
      range: this.serializeRange({ from, to }),
      sessions: sessions.map((session) => {
        const openingBalance = Number(session.openingBalance);
        const cash = Number(session.closingCash ?? 0);
        const card = Number(session.closingCard ?? 0);
        const yape = Number(session.closingYape ?? 0);
        return {
          id: session.id,
          openedAt: session.openedAt,
          closedAt: session.closedAt,
          openedBy: session.openedBy,
          closedBy: session.closedBy,
          openingBalance,
          cash,
          card,
          yape,
          total: round2(cash + card + yape),
          ordersCount: Number(session.ordersCount ?? 0),
          expectedCash: round2(openingBalance + cash),
        };
      }),
    };
  }

  // ---------- Inventario ----------

  async inventoryReport(organizationId: string, dto: ReportsRangeDto) {
    const { from, to } = this.resolveRange(dto);
    const now = new Date();

    const [consumptionRows, ingredients, expiringSoonRows, expiredRows] =
      await Promise.all([
        this.prisma.inventoryMovement.findMany({
          where: {
            ingredient: { organizationId },
            type: 'OUT',
            createdAt: { gte: from, lte: to },
          },
          select: {
            ingredientId: true,
            quantity: true,
            ingredient: { select: { name: true, unit: true } },
          },
        }),
        this.prisma.ingredient.findMany({
          where: { organizationId, active: true },
          select: { name: true, unit: true, stock: true, minStock: true },
        }),
        this.prisma.inventoryLot.findMany({
          where: {
            ingredient: { organizationId },
            remaining: { gt: 0 },
            expiresAt: { gte: now, lte: addDays(now, 30) },
          },
          select: {
            remaining: true,
            expiresAt: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        }),
        this.prisma.inventoryLot.findMany({
          where: {
            ingredient: { organizationId },
            remaining: { gt: 0 },
            expiresAt: { lte: now },
          },
          select: {
            remaining: true,
            expiresAt: true,
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        }),
      ]);

    const consumptionMap = new Map<
      string,
      { ingredientId: string; name: string; unit: string; quantity: number }
    >();
    for (const movement of consumptionRows) {
      const entry =
        consumptionMap.get(movement.ingredientId) ?? {
          ingredientId: movement.ingredientId,
          name: movement.ingredient.name,
          unit: movement.ingredient.unit,
          quantity: 0,
        };
      entry.quantity = round3(entry.quantity + Number(movement.quantity));
      consumptionMap.set(movement.ingredientId, entry);
    }

    const lowStock = ingredients
      .filter((ingredient) => Number(ingredient.stock) < Number(ingredient.minStock))
      .map((ingredient) => ({
        name: ingredient.name,
        unit: ingredient.unit,
        stock: Number(ingredient.stock),
        minStock: Number(ingredient.minStock),
      }));

    const mapLot = (lot: {
      remaining: unknown;
      expiresAt: Date | null;
      ingredient: { id: string; name: string; unit: string };
    }) => ({
      ingredientId: lot.ingredient.id,
      ingredientName: lot.ingredient.name,
      unit: lot.ingredient.unit,
      remaining: Number(lot.remaining),
      expiresAt: lot.expiresAt,
    });

    return {
      range: this.serializeRange({ from, to }),
      consumption: [...consumptionMap.values()].sort(
        (a, b) => b.quantity - a.quantity,
      ),
      lowStock,
      expiring: {
        soon: expiringSoonRows.map(mapLot),
        expired: expiredRows.map(mapLot),
      },
    };
  }

  // ---------- Exportar a Excel ----------

  async export(organizationId: string, dto: ReportsRangeDto) {
    const [summary, trend, products, service, cash, inventory] =
      await Promise.all([
        this.summary(organizationId, dto),
        this.salesTrend(organizationId, { ...dto, granularity: 'day' }),
        this.topProducts(organizationId, { ...dto, limit: 50 }),
        this.serviceReport(organizationId, dto),
        this.cashReport(organizationId, dto),
        this.inventoryReport(organizationId, dto),
      ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RestobarService';

    this.buildSummarySheet(workbook, summary);
    this.buildTrendSheet(workbook, trend);
    this.buildProductsSheet(workbook, products);
    this.buildServiceSheet(workbook, service);
    this.buildCashSheet(workbook, cash);
    this.buildInventorySheet(workbook, inventory);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ---------- Utilidades de rango ----------

  private resolveRange(dto: RangeInput): ResolvedRange {
    const now = new Date();
    const from = dto.from
      ? dto.from.includes('T')
        ? new Date(dto.from)
        : startOfDay(new Date(dto.from))
      : startOfDay(addDays(now, -29));
    const to = dto.to
      ? dto.to.includes('T')
        ? new Date(dto.to)
        : endOfDay(new Date(dto.to))
      : now;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (to < from) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la de fin',
      );
    }

    const spanMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - spanMs);
    const prevTo = new Date(from.getTime());

    return { from, to, prevFrom, prevTo };
  }

  private serializeRange({ from, to }: { from: Date; to: Date }) {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  private periodKey(
    date: Date,
    granularity: 'day' | 'week' | 'month',
  ): string {
    if (granularity === 'month') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    if (granularity === 'week') {
      const dayFromMonday = (date.getDay() + 6) % 7;
      const monday = new Date(date);
      monday.setDate(date.getDate() - dayFromMonday);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // ---------- Utilidades de Excel ----------

  private addSheet<T>(workbook: ExcelJS.Workbook, name: string) {
    return workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 2 }],
      properties: { defaultRowHeight: 18 },
    });
  }

  private titleRow(
    worksheet: ExcelJS.Worksheet,
    left: string,
    right?: string,
  ) {
    const row = worksheet.addRow([left]);
    if (right !== undefined) {
      row.getCell(2).value = right;
      row.getCell(2).alignment = { horizontal: 'right' };
    }
    row.font = { bold: true, size: 14 };
    worksheet.addRow([]);
  }

  private headerRow(worksheet: ExcelJS.Worksheet, headers: string[]) {
    const row = worksheet.addRow(headers);
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
  }

  private kpiSheetRow(
    worksheet: ExcelJS.Worksheet,
    label: string,
    value: unknown,
    money = false,
  ) {
    const row = worksheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (money) {
      row.getCell(2).numFmt = MONEY_FORMAT;
    }
    return row;
  }

  private moneyColumn(worksheet: ExcelJS.Worksheet, col: number) {
    worksheet.getColumn(col).numFmt = MONEY_FORMAT;
  }

  private buildSummarySheet(workbook: ExcelJS.Workbook, summary: Awaited<ReturnType<ReportsService['summary']>>) {
    const sheet = this.addSheet(workbook, 'Resumen');
    this.titleRow(
      sheet,
      `Resumen de ventas (${summary.range.from.slice(0, 10)} a ${summary.range.to.slice(0, 10)})`,
    );
    this.kpiSheetRow(sheet, 'Ingresos', summary.revenue, true);
    this.kpiSheetRow(sheet, 'Nº de pedidos', summary.ordersCount);
    this.kpiSheetRow(sheet, 'Ticket promedio', summary.avgTicket, true);
    this.kpiSheetRow(sheet, 'Cancelaciones', summary.cancelledCount);
    this.kpiSheetRow(sheet, 'Monto cancelado', summary.cancelledAmount, true);
    this.kpiSheetRow(sheet, 'Período anterior', summary.prevRevenue, true);
    this.kpiSheetRow(
      sheet,
      'Variación ingresos vs período anterior',
      summary.revenueDeltaPct === null
        ? '-'
        : `${summary.revenueDeltaPct} %`,
    );
    this.kpiSheetRow(sheet, 'Nº pedidos período anterior', summary.prevOrdersCount);
    this.kpiSheetRow(
      sheet,
      'Variación ticket promedio vs período anterior',
      summary.avgTicketDeltaPct === null
        ? '-'
        : `${summary.avgTicketDeltaPct} %`,
    );
    sheet.addRow([]);

    this.headerRow(sheet, ['Método de pago', 'Monto', 'Nº pagos']);
    summary.byPaymentMethod.forEach((entry) => {
      const row = sheet.addRow([entry.method, entry.amount, entry.count]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Tipo de pedido', 'Monto', 'Nº pedidos']);
    summary.byOrderType.forEach((entry) => {
      const row = sheet.addRow([entry.type, entry.amount, entry.count]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    });
    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 12;
  }

  private buildTrendSheet(
    workbook: ExcelJS.Workbook,
    trend: Awaited<ReturnType<ReportsService['salesTrend']>>,
  ) {
    const sheet = this.addSheet(workbook, 'Tendencias');
    this.titleRow(sheet, 'Evolución de ventas');

    this.headerRow(sheet, ['Período', 'Ingresos', 'Pedidos']);
    trend.series.forEach((entry) => {
      const row = sheet.addRow([entry.period, entry.revenue, entry.orders]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    });
    sheet.addRow([]);

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    this.headerRow(sheet, ['Día de la semana', 'Ingresos', 'Pedidos']);
    trend.byDayOfWeek.forEach((entry) => {
      const row = sheet.addRow([dayNames[entry.day - 1], entry.revenue, entry.orders]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Hora', 'Ingresos', 'Pedidos']);
    trend.byHour.forEach((entry) => {
      const row = sheet.addRow([`${entry.hour}:00`, entry.revenue, entry.orders]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    });
    sheet.getColumn(1).width = 16;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 12;
  }

  private buildProductsSheet(
    workbook: ExcelJS.Workbook,
    products: Awaited<ReturnType<ReportsService['topProducts']>>,
  ) {
    const sheet = this.addSheet(workbook, 'Productos');
    this.titleRow(sheet, 'Desempeño de productos');

    this.headerRow(sheet, ['Platillo', 'Categoría', 'Unidades', 'Ingresos']);
    products.top.forEach((entry) => {
      const row = sheet.addRow([
        entry.productName,
        entry.category,
        entry.quantity,
        entry.revenue,
      ]);
      row.getCell(4).numFmt = MONEY_FORMAT;
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Categoría', 'Unidades', 'Ingresos', 'Participación']);
    products.byCategory.forEach((entry) => {
      const row = sheet.addRow([
        entry.category,
        entry.quantity,
        entry.revenue,
        `${entry.share} %`,
      ]);
      row.getCell(3).numFmt = MONEY_FORMAT;
    });
    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 16;
  }

  private buildServiceSheet(
    workbook: ExcelJS.Workbook,
    service: Awaited<ReturnType<ReportsService['serviceReport']>>,
  ) {
    const sheet = this.addSheet(workbook, 'Servicio');
    this.titleRow(sheet, 'Operación y servicio');

    const mins = (ms: number | null) =>
      ms === null ? '-' : Math.round(ms / 60000);
    this.kpiSheetRow(sheet, 'Tiempo promedio de cocina (min)', mins(service.serviceTimes.avgKitchenMs));
    this.kpiSheetRow(sheet, 'Tiempo promedio hasta servido (min)', mins(service.serviceTimes.avgTotalMs));
    this.kpiSheetRow(sheet, 'Mesas totales', service.tables.total);
    this.kpiSheetRow(sheet, 'Mesas ocupadas en el período', service.tables.occupied);
    this.kpiSheetRow(sheet, 'Ocupación (%)', service.tables.utilization);
    this.kpiSheetRow(sheet, 'Pedidos promedio por mesa', service.tables.avgOrdersPerTable);
    this.kpiSheetRow(sheet, 'Permanencia promedio (min)', mins(service.tables.avgDineInDurationMs));
    sheet.addRow([]);

    this.headerRow(sheet, ['Mesero', 'Pedidos', 'Ventas']);
    service.byWaiter.forEach((entry) => {
      const row = sheet.addRow([entry.name, entry.orders, entry.revenue]);
      row.getCell(3).numFmt = MONEY_FORMAT;
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Mesa', 'Sección', 'Pedidos', 'Ventas']);
    service.tables.ranking.forEach((entry) => {
      const row = sheet.addRow([
        entry.number,
        entry.section,
        entry.orders,
        entry.revenue,
      ]);
      row.getCell(4).numFmt = MONEY_FORMAT;
    });
    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 16;
  }

  private buildCashSheet(
    workbook: ExcelJS.Workbook,
    cash: Awaited<ReturnType<ReportsService['cashReport']>>,
  ) {
    const sheet = this.addSheet(workbook, 'Caja');
    this.titleRow(sheet, 'Cierres de caja');

    this.headerRow(sheet, [
      'Apertura',
      'Cierre',
      'Abrió',
      'Cerró',
      'Caja chica',
      'Efectivo',
      'Tarjeta',
      'Yape/Plin',
      'Total',
      'Pedidos',
      'Efectivo esperado',
    ]);
    cash.sessions.forEach((session) => {
      const row = sheet.addRow([
        new Date(session.openedAt).toLocaleString('es-PE'),
        session.closedAt ? new Date(session.closedAt).toLocaleString('es-PE') : '',
        session.openedBy.name,
        session.closedBy?.name ?? '',
        session.openingBalance,
        session.cash,
        session.card,
        session.yape,
        session.total,
        session.ordersCount,
        session.expectedCash,
      ]);
      [5, 6, 7, 8, 9, 11].forEach((col) => {
        row.getCell(col).numFmt = MONEY_FORMAT;
      });
    });
    ['G', 'H', 'I', 'J', 'K'].forEach((col) => sheet.getColumn(col).width = 14);
    sheet.getColumn(1).width = 22;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 14;
  }

  private buildInventorySheet(
    workbook: ExcelJS.Workbook,
    inventory: Awaited<ReturnType<ReportsService['inventoryReport']>>,
  ) {
    const sheet = this.addSheet(workbook, 'Inventario');
    this.titleRow(sheet, 'Inventario');

    this.headerRow(sheet, ['Insumo', 'Unidad', 'Consumo en el período']);
    inventory.consumption.forEach((entry) => {
      sheet.addRow([entry.name, entry.unit, entry.quantity]);
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Insumo', 'Unidad', 'Stock', 'Stock mínimo']);
    inventory.lowStock.forEach((entry) => {
      sheet.addRow([entry.name, entry.unit, entry.stock, entry.minStock]);
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Insumo (por vencer)', 'Unidad', 'Restante', 'Vence']);
    inventory.expiring.soon.forEach((entry) => {
      sheet.addRow([
        entry.ingredientName,
        entry.unit,
        entry.remaining,
        entry.expiresAt ? new Date(entry.expiresAt).toISOString().slice(0, 10) : '',
      ]);
    });
    sheet.addRow([]);

    this.headerRow(sheet, ['Insumo (vencido)', 'Unidad', 'Restante', 'Venció']);
    inventory.expiring.expired.forEach((entry) => {
      sheet.addRow([
        entry.ingredientName,
        entry.unit,
        entry.remaining,
        entry.expiresAt ? new Date(entry.expiresAt).toISOString().slice(0, 10) : '',
      ]);
    });
    sheet.getColumn(1).width = 32;
    sheet.getColumn(2).width = 10;
    sheet.getColumn(3).width = 16;
    sheet.getColumn(4).width = 14;
  }
}
