import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardSlotsController } from './dashboard-slots.controller';
import { PublicSlotsController } from './public-slots.controller';
import { SlotsService } from './slots.service';

@Module({
  imports: [AuditModule],
  controllers: [DashboardSlotsController, PublicSlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
