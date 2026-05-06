import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardReportsController } from './dashboard-reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuditModule],
  controllers: [DashboardReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
