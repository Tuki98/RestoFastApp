import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { organizationId },
      orderBy: { number: 'asc' },
      include: { _count: { select: { orders: true, reservations: true } } },
    });

    return tables.map((table) => ({
      id: table.id,
      number: table.number,
      seats: table.seats,
      section: table.section,
      status: table.status,
      qrToken: table.qrToken,
      ordersCount: table._count.orders,
      reservationsCount: table._count.reservations,
    }));
  }

  async findByToken(token: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrToken: token },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
    return {
      id: table.id,
      number: table.number,
      seats: table.seats,
      section: table.section,
      status: table.status,
    };
  }

  async create(organizationId: string, dto: CreateTableDto) {
    try {
      return await this.prisma.restaurantTable.create({
        data: {
          organizationId,
          number: dto.number,
          seats: dto.seats,
          section: dto.section ?? 'Interior',
          qrToken: randomBytes(8).toString('hex'),
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Ya existe una mesa con ese número');
      }
      throw error;
    }
  }

  async update(organizationId: string, id: string, dto: UpdateTableDto) {
    await this.ensureExists(id, organizationId);
    try {
      return await this.prisma.restaurantTable.update({
        where: { id },
        data: {
          number: dto.number,
          seats: dto.seats,
          section: dto.section,
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Ya existe una mesa con ese número');
      }
      throw error;
    }
  }

  async remove(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { orders: true } } },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
    if (table._count.orders > 0) {
      throw new BadRequestException(
        'No se puede eliminar: la mesa tiene órdenes asociadas.',
      );
    }
    await this.prisma.restaurantTable.delete({ where: { id } });
    return { ok: true };
  }

  async freeTable(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
    if (table.status === 'FREE') {
      throw new BadRequestException('La mesa ya está libre');
    }
    const openOrders = await this.prisma.order.findFirst({
      where: {
        tableId: id,
        status: {
            in: ['PENDING', 'IN_PREPARATION', 'READY', 'AWAITING_CONFIRMATION'],
          },
      },
    });
    if (openOrders) {
      throw new BadRequestException(
        'No se puede liberar: hay órdenes abiertas en esta mesa',
      );
    }
    await this.prisma.restaurantTable.update({
      where: { id },
      data: { status: 'FREE', occupiedViaQrAt: null },
    });
    return { ok: true };
  }

  private async ensureExists(id: string, organizationId: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
  }

  private isUniqueError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
