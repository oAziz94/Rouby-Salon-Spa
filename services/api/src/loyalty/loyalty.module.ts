import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardLoyaltyController } from './dashboard-loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, BillingModule],
  controllers: [DashboardLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
