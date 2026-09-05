import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const categories = await this.prisma.category.findMany({
      where: { organizationId },
      include: {
        products: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((category) => ({
      ...category,
      products: category.products.map((product) => ({
        ...product,
        price: Number(product.price),
      })),
    }));
  }

  async create(organizationId: string, dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          sortOrder: dto.sortOrder ?? 0,
          organizationId,
        },
      });
    } catch (error) {
      this.rethrowIfUnique(error, 'Ya existe una categoría con ese nombre');
    }
  }

  async update(organizationId: string, id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id, organizationId);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          sortOrder: dto.sortOrder,
          active: dto.active,
        },
      });
    } catch (error) {
      this.rethrowIfUnique(error, 'Ya existe una categoría con ese nombre');
    }
  }

  async remove(organizationId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { products: true } } },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (category._count.products > 0) {
      throw new BadRequestException(
        'No se puede eliminar: la categoría tiene productos asociados. Desactívala en su lugar.',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string, organizationId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
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
