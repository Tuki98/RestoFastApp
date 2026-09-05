import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { TablesCleanupService } from './tables-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TablesController],
  providers: [TablesService, TablesCleanupService],
})
export class TablesModule {}
