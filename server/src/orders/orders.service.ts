import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { PayOrderDto } from './dto/pay-order.dto';

export const TAX_RATE = 0.16;

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['IN_PREPARATION'],
  IN_PREPARATION: ['READY'],
  READY: ['SERVED'],
  SERVED: [],
  PAID: [],
  CANCELLED: [],
  AWAITING_CONFIRMATION: ['PENDING'],
};

const OPEN_STATUSES: OrderStatus[] = [
  'PENDING',
  'IN_PREPARATION',
  'READY',
  'SERVED',
  'AWAITING_CONFIRMATION',
];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters: { status?: string; tableId?: string } = {},
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        organizationId,
        status: filters.status as OrderStatus | undefined,
        tableId: filters.tableId,
      },
      include: {
        items: { orderBy: { id: 'asc' } },
        table: { select: { id: true, number: true, section: true } },
        createdBy: { select: { id: true, name: true } },
        statusHistory: {
          orderBy: { changedAt: 'asc' },
          select: { status: true, changedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.serialize(order));
  }

  async findOne(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: {
        items: { orderBy: { id: 'asc' } },
        table: { select: { id: true, number: true, section: true } },
        createdBy: { select: { id: true, name: true } },
        payments: { orderBy: { paidAt: 'asc' } },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    return this.serialize(order);
  }

  async create(organizationId: string, userId: string, dto: CreateOrderDto) {
    if (dto.orderType === 'DINE_IN') {
      if (!dto.tableId) {
        throw new BadRequestException(
          'Se requiere una mesa para la comanda de mesa',
        );
      }
    } else if (dto.tableId) {
      throw new BadRequestException(
        'Una comanda para llevar no puede tener mesa',
      );
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Uno o más productos no existen');
    }

    if (dto.tableId) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: dto.tableId, organizationId },
      });
      if (!table) {
        throw new BadRequestException('La mesa no existe');
      }
    }

    const byId = new Map(products.map((product) => [product.id, product]));

    let subtotalCents = 0;
    const items = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new BadRequestException('Uno o más productos no existen');
      }
      const unitCents = Math.round(Number(product.price) * 100);
      subtotalCents += unitCents * item.quantity;
      return {
        productId: product.id,
        productName: product.name,
        unitPrice: unitCents / 100,
        quantity: item.quantity,
        notes: item.notes?.trim() || null,
      };
    });

    // El IGV va desactivado por defecto; el cajero decide aplicarlo al cobrar.
    const taxCents = 0;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          organizationId,
          orderType: dto.orderType,
          tableId: dto.tableId ?? null,
          notes: dto.notes?.trim() || null,
          status: 'PENDING',
          subtotal: subtotalCents / 100,
          tax: taxCents / 100,
          total: (subtotalCents + taxCents) / 100,
          createdById: userId,
          items: { create: items },
          statusHistory: {
            create: { status: 'PENDING', changedById: userId },
          },
        },
        include: {
          items: { orderBy: { id: 'asc' } },
          table: { select: { id: true, number: true, section: true } },
          createdBy: { select: { id: true, name: true } },
          statusHistory: {
            orderBy: { changedAt: 'asc' },
            select: { status: true, changedAt: true },
          },
        },
      });

      if (dto.tableId) {
        await tx.restaurantTable.update({
          where: { id: dto.tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      return this.serialize(order);
    });
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateOrderStatusDto,
    userId: string,
  ) {
    const order = await this.getOrder(id, organizationId);
    if (order.status === 'PAID' || order.status === 'CANCELLED') {
      throw new BadRequestException(
        `No se puede modificar una orden ${
          order.status === 'PAID' ? 'pagada' : 'cancelada'
        }`,
      );
    }

    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar la orden de "${order.status}" a "${dto.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: dto.status },
        include: {
          items: { orderBy: { id: 'asc' } },
          table: { select: { id: true, number: true, section: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: id, status: dto.status, changedById: userId },
      });

      return this.serialize(updated);
    });
  }

  async cancel(organizationId: string, id: string, userId: string) {
    const order = await this.getOrder(id, organizationId);
    if (order.status === 'PAID') {
      throw new BadRequestException('No se puede cancelar una orden pagada');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('La orden ya está cancelada');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          items: { orderBy: { id: 'asc' } },
          table: { select: { id: true, number: true, section: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: id, status: 'CANCELLED', changedById: userId },
      });

      if (updated.tableId) {
        await tx.restaurantTable.update({
          where: { id: updated.tableId },
          data: { status: 'FREE' },
        });
      }

      return this.serialize(updated);
    });
  }

  async pay(
    organizationId: string,
    id: string,
    dto: PayOrderDto,
    userId: string,
  ) {
    const order = await this.getOrder(id, organizationId);
    if (order.status === 'PAID') {
      throw new BadRequestException('La orden ya está pagada');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('No se puede cobrar una orden cancelada');
    }

    // El IGV va desactivado por defecto; el cajero decide aplicarlo al cobrar.
    const subtotalCents = Math.round(Number(order.subtotal) * 100);
    let taxCents = Math.round(Number(order.tax) * 100);
    let totalCents = subtotalCents + taxCents;
    if (dto.applyIgv) {
      taxCents = Math.round(subtotalCents * TAX_RATE);
      totalCents = subtotalCents + taxCents;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          ...(dto.applyIgv
            ? { tax: taxCents / 100, total: totalCents / 100 }
            : {}),
        },
        include: {
          items: { orderBy: { id: 'asc' } },
          table: { select: { id: true, number: true, section: true } },
          createdBy: { select: { id: true, name: true } },
          payments: { orderBy: { paidAt: 'asc' } },
        },
      });

      await tx.payment.create({
        data: {
          orderId: id,
          method: dto.method,
          amount: dto.applyIgv ? totalCents / 100 : order.total,
          receivedById: userId,
        },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: id, status: 'PAID', changedById: userId },
      });

      if (updated.tableId) {
        await tx.restaurantTable.update({
          where: { id: updated.tableId },
          data: { status: 'FREE' },
        });
      }

      return this.serialize(updated);
    });
  }

  /** Órdenes abiertas de una mesa (para continuar o cobrar desde el POS). */
  async findOpenByTable(organizationId: string, tableId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tableId, organizationId, status: { in: OPEN_STATUSES } },
      include: {
        items: { orderBy: { id: 'asc' } },
        table: { select: { id: true, number: true, section: true } },
        createdBy: { select: { id: true, name: true } },
        statusHistory: {
          orderBy: { changedAt: 'asc' },
          select: { status: true, changedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((order) => this.serialize(order));
  }

  private async getOrder(id: string, organizationId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
    });
    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }

  private serialize<
    T extends {
      subtotal: unknown;
      tax: unknown;
      total: unknown;
      items: { unitPrice: unknown }[];
      status: unknown;
      createdAt: unknown;
      statusHistory?: { status: unknown; changedAt: unknown }[] | undefined;
    },
  >(order: T) {
    return {
      ...order,
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      total: Number(order.total),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
      })),
      statusTimes: this.buildStatusTimes(
        order.status as OrderStatus,
        order.createdAt as Date,
        (order.statusHistory ?? []) as {
          status: OrderStatus;
          changedAt: Date;
        }[],
      ),
    };
  }

  /** Tiempo que la orden permaneció en cada estado, a partir del historial. */
  private buildStatusTimes(
    status: OrderStatus,
    createdAt: Date,
    history: { status: OrderStatus; changedAt: Date }[],
  ) {
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );

    if (sorted.length === 0) {
      const startedMs = new Date(createdAt).getTime();
      return [
        {
          status,
          startedAt: createdAt,
          endedAt: null,
          durationMs: Math.max(0, Date.now() - startedMs),
        },
      ];
    }

    return sorted.map((entry, i) => {
      const next = sorted[i + 1];
      const startedMs = new Date(entry.changedAt).getTime();
      const endMs = next ? new Date(next.changedAt).getTime() : Date.now();
      return {
        status: entry.status,
        startedAt: entry.changedAt,
        endedAt: next ? next.changedAt : null,
        durationMs: Math.max(0, endMs - startedMs),
      };
    });
  }
}
