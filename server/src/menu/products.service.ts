import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return products.map((product) => ({
      ...product,
      price: Number(product.price),
    }));
  }

  async create(organizationId: string, dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId, organizationId);
    try {
      return await this.prisma.product.create({
        data: {
          categoryId: dto.categoryId,
          organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          price: dto.price,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      this.rethrowIfUnique(
        error,
        'Ya existe un producto con ese nombre en la categoría',
      );
    }
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    await this.ensureProductExists(id, organizationId);
    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId, organizationId);
    }
    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          price: dto.price,
          sortOrder: dto.sortOrder,
          active: dto.active,
        },
      });
    } catch (error) {
      this.rethrowIfUnique(
        error,
        'Ya existe un producto con ese nombre en la categoría',
      );
    }
  }

  async remove(organizationId: string, id: string) {
    await this.ensureProductExists(id, organizationId);
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureCategoryExists(
    categoryId: string,
    organizationId: string,
  ) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId },
    });
    if (!category) {
      throw new BadRequestException('La categoría no existe');
    }
  }

  private async ensureProductExists(id: string, organizationId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
  }

  private rethrowIfUnique(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
