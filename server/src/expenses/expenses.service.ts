import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const EXPENSE_INCLUDE = {
  registeredBy: { select: { id: true, name: true } },
} as const;

export interface FindExpensesFilters {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: FindExpensesFilters = {}) {
    const incurredAt: { gte?: Date; lte?: Date } = {};
    if (filters.from) incurredAt.gte = new Date(filters.from);
    if (filters.to) incurredAt.lte = new Date(filters.to);

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.from || filters.to ? { incurredAt } : {}),
      },
      include: EXPENSE_INCLUDE,
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return expenses.map((expense) => this.serialize(expense));
  }

  async create(organizationId: string, userId: string, dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        organizationId,
        description: dto.description.trim(),
        amount: Math.round(dto.amount * 100) / 100,
        category: dto.category ?? ExpenseCategory.OTROS,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(),
        note: dto.note?.trim() || null,
        registeredById: userId,
      },
      include: EXPENSE_INCLUDE,
    });

    return this.serialize(expense);
  }

  async update(organizationId: string, id: string, dto: UpdateExpenseDto) {
    await this.ensureExpense(id, organizationId);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.amount !== undefined
          ? { amount: Math.round(dto.amount * 100) / 100 }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.incurredAt !== undefined
          ? { incurredAt: new Date(dto.incurredAt) }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
      include: EXPENSE_INCLUDE,
    });

    return this.serialize(expense);
  }

  async remove(organizationId: string, id: string) {
    await this.ensureExpense(id, organizationId);
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }

  private async ensureExpense(id: string, organizationId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!expense) {
      throw new NotFoundException('Gasto no encontrado');
    }
  }

  private serialize(expense: {
    id: string;
    description: string;
    amount: unknown;
    category: ExpenseCategory;
    incurredAt: Date;
    note: string | null;
    registeredBy: { id: string; name: string };
    createdAt: Date;
  }) {
    return {
      id: expense.id,
      description: expense.description,
      amount: Number(expense.amount),
      category: expense.category,
      incurredAt: expense.incurredAt,
      note: expense.note,
      registeredBy: expense.registeredBy,
      createdAt: expense.createdAt,
    };
  }
}
