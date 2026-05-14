import { Module } from '@nestjs/common';
import { DashboardClientsController } from './dashboard-clients.controller';
import { DashboardClientsService } from './dashboard-clients.service';

@Module({
  controllers: [DashboardClientsController],
  providers: [DashboardClientsService],
  exports: [DashboardClientsService],
})
export class ClientsModule {}
