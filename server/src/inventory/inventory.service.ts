import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryArea, MovementType } from '../../generated/prisma/enums';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateExitDto } from './dto/create-exit.dto';

export const ALERT_WINDOW_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOT_SORT = 1000;

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * LOT_SORT) / LOT_SORT;
}

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface IngredientWithLots {
  id: string;
  name: string;
  unit: string;
  area: InventoryArea;
  stock: number | { toString(): string };
  minStock: number | { toString(): string };
  shelfLifeDays: number | null;
  active: boolean;
  lots: InventoryLotRow[];
}

interface InventoryLotRow {
  id: string;
  quantity: number | { toString(): string };
  remaining: number | { toString(): string };
  receivedAt: Date;
  expiresAt: Date | null;
  exitedAt: Date | null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findIngredients(organizationId: string, area?: InventoryArea) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { organizationId, ...(area ? { area } : {}) },
      include: {
        lots: { orderBy: { receivedAt: 'desc' } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    return ingredients.map((ingredient) =>
      this.serializeIngredient(ingredient),
    );
  }

  async createIngredient(organizationId: string, dto: CreateIngredientDto) {
    try {
      return await this.prisma.ingredient.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          unit: dto.unit.trim(),
          area: dto.area ?? InventoryArea.BARRA,
          minStock: dto.minStock ?? 0,
          shelfLifeDays: dto.shelfLifeDays ?? null,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Ya existe un ingrediente con ese nombre');
      }
      throw error;
    }
  }

  async updateIngredient(
    organizationId: string,
    id: string,
    dto: UpdateIngredientDto,
  ) {
    await this.ensureIngredient(id, organizationId);
    try {
      return await this.prisma.ingredient.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          unit: dto.unit?.trim(),
          minStock: dto.minStock,
          shelfLifeDays: dto.shelfLifeDays,
          active: dto.active,
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Ya existe un ingrediente con ese nombre');
      }
      throw error;
    }
  }

  async removeIngredient(organizationId: string, id: string) {
    await this.ensureIngredient(id, organizationId);
    try {
      await this.prisma.ingredient.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2039')
      ) {
        throw new ConflictException(
          'No se puede eliminar: el ingrediente tiene movimientos registrados. Desactívalo en su lugar.',
        );
      }
      throw error;
    }
    return { ok: true };
  }

  /** Registra una carga de inventario: crea el lote y arranca el conteo de caducidad. */
  async registerEntry(
    organizationId: string,
    ingredientId: string,
    dto: CreateEntryDto,
    userId: string,
  ) {
    const ingredient = await this.getIngredient(ingredientId, organizationId);
    const quantity = round3(dto.quantity);
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now()) {
      throw new BadRequestException('La fecha de ingreso no puede ser futura');
    }

    const expiresAt = ingredient.shelfLifeDays
      ? new Date(receivedAt.getTime() + ingredient.shelfLifeDays * DAY_MS)
      : null;

    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({
        data: {
          ingredientId,
          quantity,
          remaining: quantity,
          receivedAt,
          expiresAt,
        },
      });

      await this.createMovement(tx, {
        ingredientId,
        lotId: lot.id,
        type: 'IN',
        quantity,
        area: ingredient.area,
        note: dto.note?.trim() || null,
        userId,
      });

      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: { increment: quantity } },
      });

      return this.serializeLot(lot);
    });
  }

  /** Registra una salida de inventario consumiendo lotes (primero el que caduca antes). */
  async registerExit(
    organizationId: string,
    ingredientId: string,
    dto: CreateExitDto,
    userId: string,
  ) {
    const quantity = round3(dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findFirst({
        where: { id: ingredientId, organizationId },
      });
      if (!ingredient) {
        throw new NotFoundException('Ingrediente no encontrado');
      }

      const stock = Number(ingredient.stock);
      if (quantity > stock) {
        throw new BadRequestException(
          `Stock insuficiente: solo hay ${stock} ${ingredient.unit}`,
        );
      }

      const lots = await tx.inventoryLot.findMany({
        where: { ingredientId, remaining: { gt: 0 } },
      });
      lots.sort((a, b) => {
        const expA = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const expB = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (expA !== expB) return expA - expB;
        return a.receivedAt.getTime() - b.receivedAt.getTime();
      });

      let toTake = quantity;
      for (const lot of lots) {
        if (toTake <= 0) break;
        const lotRemaining = Number(lot.remaining);
        const take = Math.min(lotRemaining, toTake);
        const newRemaining = round3(lotRemaining - take);
        toTake = round3(toTake - take);

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            remaining: newRemaining,
            exitedAt: newRemaining === 0 ? new Date() : null,
          },
        });

        await this.createMovement(tx, {
          ingredientId,
          lotId: lot.id,
          type: 'OUT',
          quantity: take,
          area: ingredient.area,
          note: dto.note?.trim() || null,
          userId,
        });
      }

      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: { decrement: quantity } },
      });

      return { ok: true };
    });
  }

  /** Alertas de caducidad (2 días antes) y de stock mínimo. */
  async getAlerts(organizationId: string) {
    const ingredients = await this.findIngredients(organizationId);
    const alerts: unknown[] = [];

    for (const ingredient of ingredients) {
      if (ingredient.lowStock) {
        alerts.push({
          type: 'LOW_STOCK',
          ingredient: this.ingredientRef(ingredient),
          stock: ingredient.stock,
          minStock: ingredient.minStock,
          daysLeft: null,
        });
      }

      for (const lot of ingredient.lots) {
        if (Number(lot.remaining) <= 0) continue;
        if (lot.alert === 'EXPIRED') {
          alerts.push({
            type: 'EXPIRED',
            ingredient: this.ingredientRef(ingredient),
            lot: this.lotRef(lot),
            daysLeft: lot.daysLeft,
          });
        } else if (lot.alert === 'EXPIRING_SOON') {
          alerts.push({
            type: 'EXPIRING_SOON',
            ingredient: this.ingredientRef(ingredient),
            lot: this.lotRef(lot),
            daysLeft: lot.daysLeft,
          });
        }
      }
    }

    const order: Record<string, number> = {
      EXPIRED: 0,
      EXPIRING_SOON: 1,
      LOW_STOCK: 2,
    };
    alerts.sort((a, b) => {
      const ta = order[(a as { type: string }).type];
      const tb = order[(b as { type: string }).type];
      return (ta ?? 9) - (tb ?? 9);
    });

    return alerts;
  }

  async findMovements(
    organizationId: string,
    ingredientId?: string,
    area?: InventoryArea,
  ) {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        ingredient: {
          organizationId,
          ...(area ? { area } : {}),
        },
        ...(ingredientId ? { ingredientId } : {}),
      },
      include: {
        ingredient: {
          select: { id: true, name: true, unit: true, area: true },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return movements.map((movement) => ({
      ...movement,
      quantity: Number(movement.quantity),
    }));
  }

  private serializeIngredient(ingredient: IngredientWithLots) {
    const stock = Number(ingredient.stock);
    const minStock = Number(ingredient.minStock);
    const lots = ingredient.lots.map((lot) => this.serializeLot(lot));

    return {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      area: ingredient.area,
      stock,
      minStock,
      shelfLifeDays: ingredient.shelfLifeDays,
      active: ingredient.active,
      lowStock: stock < minStock,
      lots,
    };
  }

  private serializeLot(lot: InventoryLotRow) {
    const now = Date.now();
    let alert: 'EXPIRING_SOON' | 'EXPIRED' | null = null;
    let daysLeft: number | null = null;

    if (lot.expiresAt) {
      const msLeft = lot.expiresAt.getTime() - now;
      daysLeft = Math.ceil(msLeft / DAY_MS);
      if (Number(lot.remaining) > 0) {
        if (msLeft < 0) {
          alert = 'EXPIRED';
        } else if (msLeft <= ALERT_WINDOW_DAYS * DAY_MS) {
          alert = 'EXPIRING_SOON';
        }
      }
    }

    return {
      id: lot.id,
      quantity: Number(lot.quantity),
      remaining: Number(lot.remaining),
      receivedAt: lot.receivedAt,
      expiresAt: lot.expiresAt,
      exitedAt: lot.exitedAt,
      alert,
      daysLeft,
    };
  }

  private async createMovement(
    tx: TxClient,
    data: {
      ingredientId: string;
      lotId: string;
      type: MovementType;
      quantity: number;
      area: InventoryArea;
      note: string | null;
      userId: string;
    },
  ) {
    await tx.inventoryMovement.create({ data });
  }

  private ingredientRef(ingredient: {
    id: string;
    name: string;
    unit: string;
    area?: InventoryArea;
  }) {
    return {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      area: ingredient.area,
    };
  }

  private lotRef(lot: {
    id: string;
    receivedAt: Date;
    expiresAt: Date | null;
  }) {
    return {
      id: lot.id,
      receivedAt: lot.receivedAt,
      expiresAt: lot.expiresAt,
    };
  }

  private async getIngredient(id: string, organizationId: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, organizationId },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingrediente no encontrado');
    }
    return ingredient;
  }

  private async ensureIngredient(id: string, organizationId: string) {
    await this.getIngredient(id, organizationId);
  }

  private isUniqueError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
