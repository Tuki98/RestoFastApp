import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PublicCreateOrderDto } from './dto/public-create-order.dto';

@Injectable()
export class PublicMenuService {
  constructor(private readonly prisma: PrismaService) {}

  private async getTableByToken(token: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrToken: token },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
    return table;
  }

  /** Carta pública de una mesa: resuelve la organización desde el token QR. */
  async findByTableToken(token: string) {
    const table = await this.getTableByToken(token);

    const organization = await this.prisma.organization.findUnique({
      where: { id: table.organizationId },
      select: { name: true },
    });

    const categories = await this.prisma.category.findMany({
      where: {
        organizationId: table.organizationId,
        active: true,
        products: { some: { active: true } },
      },
      include: {
        products: {
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      organizationName: organization?.name ?? 'RestobarService',
      table: {
        id: table.id,
        number: table.number,
        seats: table.seats,
        section: table.section,
        status: table.status,
      },
      categories: categories.map((category) => ({
        ...category,
        products: category.products.map((product) => ({
          ...product,
          price: Number(product.price),
        })),
      })),
    };
  }

  /** Marca la mesa como ocupada al escanear el QR (no pisa reservas). */
  async occupyByTableToken(token: string) {
    const table = await this.getTableByToken(token);
    if (table.status !== 'FREE') {
      return {
        id: table.id,
        number: table.number,
        seats: table.seats,
        section: table.section,
        status: table.status,
      };
    }

    const updated = await this.prisma.restaurantTable.update({
      where: { id: table.id },
      data: { status: 'OCCUPIED', occupiedViaQrAt: new Date() },
    });

    return {
      id: updated.id,
      number: updated.number,
      seats: updated.seats,
      section: updated.section,
      status: updated.status,
    };
  }

  /** Crea la comanda del cliente desde el QR en estado AWAITING_CONFIRMATION. */
  async createOrderForTable(token: string, dto: PublicCreateOrderDto) {
    const table = await this.getTableByToken(token);

    const session = await this.prisma.cashSession.findFirst({
      where: { closedAt: null, organizationId: table.organizationId },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) {
      throw new BadRequestException(
        'El restaurante no está atendiendo en este momento. Solicita ayuda a un mesero para tu pedido.',
      );
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: table.organizationId },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('Uno o más productos no existen');
    }

    const byId = new Map(products.map((product) => [product.id, product]));

    let subtotalCents = 0;
    const items = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new NotFoundException('Uno o más productos no existen');
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

    // IGV desactivado por defecto.
    const taxCents = 0;
    const customerToken = randomBytes(16).toString('hex');

    const order = await this.prisma.$transaction(async (tx) => {
      const sessionUpdated = await tx.cashSession.update({
        where: { id: session.id },
        data: { nextFolio: { increment: 1 } },
      });

      const created = await tx.order.create({
        data: {
          organizationId: table.organizationId,
          folio: sessionUpdated.nextFolio,
          cashSessionId: session.id,
          orderType: 'DINE_IN',
          tableId: table.id,
          notes: dto.notes?.trim() || null,
          status: 'AWAITING_CONFIRMATION',
          customerToken,
          subtotal: subtotalCents / 100,
          tax: taxCents / 100,
          total: (subtotalCents + taxCents) / 100,
          items: { create: items },
        },
        include: {
          items: { orderBy: { id: 'asc' } },
          table: { select: { id: true, number: true, section: true } },
        },
      });

      if (table.status !== 'OCCUPIED') {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED', occupiedViaQrAt: null },
        });
      } else {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { occupiedViaQrAt: null },
        });
      }

      return created;
    });

    return {
      id: order.id,
      folio: order.folio,
      orderType: order.orderType,
      tableId: order.tableId,
      table: order.table,
      status: order.status,
      customerToken: order.customerToken,
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      total: Number(order.total),
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        notes: item.notes,
      })),
    };
  }

  /** Estado público de un pedido QR, validando que pertenezca a la mesa. */
  async getOrderStatusForCustomer(token: string, customerToken: string) {
    const table = await this.getTableByToken(token);

    const order = await this.prisma.order.findFirst({
      where: {
        customerToken,
        organizationId: table.organizationId,
        tableId: table.id,
      },
      include: {
        items: { orderBy: { id: 'asc' } },
        table: { select: { id: true, number: true, section: true } },
        statusHistory: {
          orderBy: { changedAt: 'asc' },
          select: { status: true, changedAt: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return {
      id: order.id,
      folio: order.folio,
      orderType: order.orderType,
      tableId: order.tableId,
      table: order.table,
      status: order.status,
      notes: order.notes,
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      total: Number(order.total),
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        notes: item.notes,
      })),
      statusHistory: order.statusHistory,
    };
  }
}
