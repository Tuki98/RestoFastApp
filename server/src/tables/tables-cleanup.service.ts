import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const AUTO_FREE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // every 60 seconds

@Injectable()
export class TablesCleanupService implements OnModuleDestroy {
  private readonly logger = new Logger(TablesCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.cleanup().catch((err) => {
        this.logger.error('Error during table cleanup', err);
      });
    }, CHECK_INTERVAL_MS);
    this.logger.log('Table cleanup service started (every 60s)');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async cleanup() {
    const threshold = new Date(Date.now() - AUTO_FREE_AFTER_MS);

    const staleTables = await this.prisma.restaurantTable.findMany({
      where: {
        occupiedViaQrAt: { not: null, lt: threshold },
        status: 'OCCUPIED',
      },
    });

    for (const table of staleTables) {
      const openOrders = await this.prisma.order.findFirst({
        where: {
          tableId: table.id,
          status: {
            in: ['PENDING', 'IN_PREPARATION', 'READY', 'AWAITING_CONFIRMATION'],
          },
        },
      });

      if (!openOrders) {
        await this.prisma.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'FREE', occupiedViaQrAt: null },
        });
        this.logger.log(
          `Auto-freed table #${table.number} (QR scan expired)`,
        );
      }
    }
  }
}
