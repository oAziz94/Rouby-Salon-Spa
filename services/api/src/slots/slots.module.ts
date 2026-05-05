import { Module } from '@nestjs/common';
import { DashboardSlotsController } from './dashboard-slots.controller';
import { PublicSlotsController } from './public-slots.controller';
import { SlotsService } from './slots.service';

@Module({
  controllers: [DashboardSlotsController, PublicSlotsController],
  providers: [SlotsService],
  exports: [SlotsService],
})
export class SlotsModule {}
