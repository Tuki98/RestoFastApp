import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';

const ALL_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'YAPE_PLIN'];

const SESSION_INCLUDE = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
} as const;

export interface CashExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: string;
  incurredAt: Date;
}

export interface CashSummary {
  incomeByMethod: { method: PaymentMethod; amount: number }[];
  totalIncome: number;
  ordersCount: number;
  expenses: {
    total: number;
    count: number;
    items: CashExpenseItem[];
  };
  /** Ventas cobradas menos gastos en efectivo del turno. */
  netIncome: number;
  countedCash?: number;
  cashDifference?: number;
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  /** Caja abierta actual con el resumen en vivo, o null si no hay ninguna. */
  async getCurrent(organizationId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { closedAt: null, organizationId },
      include: SESSION_INCLUDE,
      orderBy: { openedAt: 'desc' },
    });

    if (!session) {
      return null;
    }

    return this.serialize(
      session,
      await this.liveSummary(organizationId, session.openedAt, undefined, session.id),
    );
  }

  /** Historial de sesiones (la abierta en curso aparece con resumen en vivo). */
  async getHistory(organizationId: string) {
    const sessions = await this.prisma.cashSession.findMany({
      where: { organizationId },
      include: SESSION_INCLUDE,
      orderBy: { openedAt: 'desc' },
      take: 100,
    });

    return Promise.all(
      sessions.map(async (session) => {
        const summary = session.closedAt
          ? this.snapshotSummary(session)
          : await this.liveSummary(organizationId, session.openedAt);
        return this.serialize(session, summary);
      }),
    );
  }

  async open(organizationId: string, userId: string, dto: OpenCashDto) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { closedAt: null, organizationId },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        'Ya hay una caja abierta. Ciérrala antes de abrir una nueva.',
      );
    }

    const session = await this.prisma.cashSession.create({
      data: {
        organizationId,
        openingBalance: Math.round(dto.openingBalance * 100) / 100,
        openedById: userId,
      },
      include: SESSION_INCLUDE,
    });

    return this.serialize(session, this.emptySummary());
  }

  async close(
    organizationId: string,
    userId: string,
    id: string,
    dto: CloseCashDto = {},
  ) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, organizationId },
      include: SESSION_INCLUDE,
    });

    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    if (session.closedAt) {
      throw new BadRequestException('La caja ya está cerrada');
    }

    // No se puede cerrar el turno con comandas sin cobrar ni cancelar.
    const openOrders = await this.prisma.order.findMany({
      where: { organizationId, status: { notIn: ['PAID', 'CANCELLED'] } },
      select: { id: true, folio: true, status: true },
    });
    if (openOrders.length > 0) {
      throw new BadRequestException(
        `No se puede cerrar la caja con ${openOrders.length} comanda(s) sin cobrar: ${openOrders
          .map((order) => `#${order.folio}`)
          .join(', ')}. Cierra o cobra cada comanda antes de cerrar el turno.`,
      );
    }

    const now = new Date();
    const summary = await this.liveSummary(
      organizationId,
      session.openedAt,
      now,
      session.id,
    );

    const expectedCash = this.expectedCashFor(
      Number(session.openingBalance),
      summary,
    );
    const countedCash =
      dto.countedCash !== undefined
        ? Math.round(dto.countedCash * 100) / 100
        : expectedCash;
    const cashDifference = Math.round((countedCash - expectedCash) * 100) / 100;

    const closed = await this.prisma.cashSession.updateMany({
      where: { id, organizationId, closedAt: null },
      data: {
        closedAt: now,
        closedById: userId,
        closingCash: this.amountFor(summary, 'CASH'),
        closingCard: this.amountFor(summary, 'CARD'),
        closingYape: this.amountFor(summary, 'YAPE_PLIN'),
        closingExpenses: summary.expenses.total,
        expensesCount: summary.expenses.count,
        countedCash,
        cashDifference,
        ordersCount: summary.ordersCount,
      },
    });

    if (closed.count === 0) {
      throw new BadRequestException('La caja ya está cerrada');
    }

    const refreshed = await this.prisma.cashSession.findFirst({
      where: { id, organizationId },
      include: SESSION_INCLUDE,
    });

    return this.serialize(refreshed ?? session, {
      ...summary,
      countedCash,
      cashDifference,
    });
  }

  /** Total por método de pago de los cobros dentro de la ventana [openedAt, to). */
  private async liveSummary(
    organizationId: string,
    openedAt: Date,
    to?: Date,
    sessionId?: string,
  ) {
    const closeTime = to ?? new Date();

    const [payments, expensesBySession, expensesByWindow] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          order: { organizationId },
          paidAt: { gte: openedAt, lt: closeTime },
        },
        select: { method: true, amount: true },
      }),
      sessionId
        ? this.prisma.expense.findMany({
            where: {
              organizationId,
              cashSessionId: sessionId,
            },
            select: {
              id: true,
              description: true,
              amount: true,
              category: true,
              incurredAt: true,
            },
            orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          incurredAt: { gte: openedAt, lt: closeTime },
        },
        select: {
          id: true,
          description: true,
          amount: true,
          category: true,
          incurredAt: true,
        },
        orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const expensesMap = new Map<string, typeof expensesBySession[0]>();
    for (const expense of expensesBySession) {
      expensesMap.set(expense.id, expense);
    }
    for (const expense of expensesByWindow) {
      if (!expensesMap.has(expense.id)) {
        expensesMap.set(expense.id, expense);
      }
    }
    const expenses = Array.from(expensesMap.values()).sort(
      (a, b) =>
        new Date(b.incurredAt).getTime() - new Date(a.incurredAt).getTime() ||
        0,
    );

    const totals: Record<PaymentMethod, number> = {
      CASH: 0,
      CARD: 0,
      YAPE_PLIN: 0,
    };

    for (const payment of payments) {
      totals[payment.method] =
        Math.round((totals[payment.method] + Number(payment.amount)) * 100) /
        100;
    }

    const incomeByMethod = ALL_METHODS.map((method) => ({
      method,
      amount: totals[method],
    }));

    const expenseItems = expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: Math.round(Number(expense.amount) * 100) / 100,
      category: expense.category,
      incurredAt: expense.incurredAt,
    }));
    const expensesTotal = this.sumItems(expenseItems);
    const totalIncome = Math.round(this.sumAmounts(incomeByMethod) * 100) / 100;

    return {
      incomeByMethod,
      totalIncome,
      ordersCount: payments.length,
      expenses: {
        total: Math.round(expensesTotal * 100) / 100,
        count: expenseItems.length,
        items: expenseItems,
      },
      netIncome: Math.round((totalIncome - expensesTotal) * 100) / 100,
    };
  }

  private snapshotSummary(session: {
    closingCash: unknown;
    closingCard: unknown;
    closingYape: unknown;
    closingExpenses: unknown;
    expensesCount: unknown;
    countedCash: unknown;
    cashDifference: unknown;
    ordersCount: unknown;
  }): CashSummary {
    const incomeByMethod = [
      {
        method: 'CASH' as PaymentMethod,
        amount: Number(session.closingCash ?? 0),
      },
      {
        method: 'CARD' as PaymentMethod,
        amount: Number(session.closingCard ?? 0),
      },
      {
        method: 'YAPE_PLIN' as PaymentMethod,
        amount: Number(session.closingYape ?? 0),
      },
    ];

    const totalIncome = this.sumAmounts(incomeByMethod);
    const expensesTotal = Number(session.closingExpenses ?? 0);

    return {
      incomeByMethod,
      totalIncome,
      ordersCount: Number(session.ordersCount ?? 0),
      expenses: {
        total: expensesTotal,
        count: Number(session.expensesCount ?? 0),
        items: [],
      },
      netIncome: Math.round((totalIncome - expensesTotal) * 100) / 100,
      countedCash:
        session.countedCash !== undefined && session.countedCash !== null
          ? Number(session.countedCash)
          : undefined,
      cashDifference:
        session.cashDifference !== undefined && session.cashDifference !== null
          ? Number(session.cashDifference)
          : undefined,
    };
  }

  private emptySummary(): CashSummary {
    return {
      incomeByMethod: ALL_METHODS.map((method) => ({ method, amount: 0 })),
      totalIncome: 0,
      ordersCount: 0,
      expenses: { total: 0, count: 0, items: [] },
      netIncome: 0,
    };
  }

  private sumItems(items: { amount: number }[]) {
    return (
      Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
    );
  }

  private sumAmounts(entries: { method: PaymentMethod; amount: number }[]) {
    return (
      Math.round(entries.reduce((sum, entry) => sum + entry.amount, 0) * 100) /
      100
    );
  }

  private amountFor(summary: CashSummary, method: PaymentMethod): number {
    return (
      summary.incomeByMethod.find((entry) => entry.method === method)?.amount ??
      0
    );
  }

  /** Efectivo esperado = caja chica + efectivo cobrado - gastos del turno. */
  private expectedCashFor(openingBalance: number, summary: CashSummary): number {
    return (
      Math.round(
        (openingBalance + this.amountFor(summary, 'CASH') - summary.expenses.total) *
          100,
      ) / 100
    );
  }

  private serialize(
    session: {
      id: string;
      openedAt: Date;
      closedAt: Date | null;
      openingBalance: unknown;
      nextFolio?: number;
      openedBy: { id: string; name: string };
      closedBy: { id: string; name: string } | null;
    },
    summary: CashSummary,
  ) {
    const openingBalance = Number(session.openingBalance);
    return {
      id: session.id,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingBalance,
      nextFolio: session.nextFolio ?? 0,
      openedBy: session.openedBy,
      closedBy: session.closedBy,
      summary: {
        ...summary,
        expectedCash: this.expectedCashFor(openingBalance, summary),
      },
    };
  }
}
