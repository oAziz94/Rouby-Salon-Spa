import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClosuresService } from './closures.service';
import { DashboardClosuresController } from './dashboard-closures.controller';
import { DashboardSlotsController } from './dashboard-slots.controller';
import { PublicSlotsController } from './public-slots.controller';
import { SlotHorizonScheduler } from './slot-horizon.scheduler';
import { SlotsService } from './slots.service';

@Module({
  imports: [AuditModule],
  controllers: [
    DashboardSlotsController,
    DashboardClosuresController,
    PublicSlotsController,
  ],
  providers: [SlotsService, ClosuresService, SlotHorizonScheduler],
  exports: [SlotsService],
})
export class SlotsModule {}
