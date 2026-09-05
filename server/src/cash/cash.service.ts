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

export interface CashSummary {
  incomeByMethod: { method: PaymentMethod; amount: number }[];
  totalIncome: number;
  ordersCount: number;
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
      await this.liveSummary(organizationId, session.openedAt),
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

    const now = new Date();
    const summary = await this.liveSummary(
      organizationId,
      session.openedAt,
      now,
    );

    const expectedCash =
      Math.round(
        (Number(session.openingBalance) + this.amountFor(summary, 'CASH')) *
          100,
      ) / 100;
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
  private async liveSummary(organizationId: string, openedAt: Date, to?: Date) {
    const closeTime = to ?? new Date();

    const payments = await this.prisma.payment.findMany({
      where: {
        order: { organizationId },
        paidAt: { gte: openedAt, lt: closeTime },
      },
      select: { method: true, amount: true },
    });

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

    return {
      incomeByMethod,
      totalIncome: this.sumAmounts(incomeByMethod),
      ordersCount: payments.length,
    };
  }

  private snapshotSummary(session: {
    closingCash: unknown;
    closingCard: unknown;
    closingYape: unknown;
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

    return {
      incomeByMethod,
      totalIncome: this.sumAmounts(incomeByMethod),
      ordersCount: Number(session.ordersCount ?? 0),
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
    };
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

  private serialize(
    session: {
      id: string;
      openedAt: Date;
      closedAt: Date | null;
      openingBalance: unknown;
      openedBy: { id: string; name: string };
      closedBy: { id: string; name: string } | null;
    },
    summary: CashSummary,
  ) {
    const cashIncome = this.amountFor(summary, 'CASH');
    return {
      id: session.id,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingBalance: Number(session.openingBalance),
      openedBy: session.openedBy,
      closedBy: session.closedBy,
      summary: {
        ...summary,
        expectedCash:
          Math.round((Number(session.openingBalance) + cashIncome) * 100) / 100,
      },
    };
  }
}
