import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CashDrawerService } from './cash-drawer.service';
import { DailyClosingService } from './daily-closing.service';
import { DashboardCashDrawerController } from './dashboard-cash-drawer.controller';
import { DashboardDailyClosingController } from './dashboard-daily-closing.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DashboardCashDrawerController, DashboardDailyClosingController],
  providers: [CashDrawerService, DailyClosingService],
})
export class FinanceModule {}
