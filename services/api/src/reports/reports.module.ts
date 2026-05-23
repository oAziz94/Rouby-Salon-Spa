import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardReportsController } from './dashboard-reports.controller';
import { ReportsService } from './reports.service';
import { StaffServicesRevenueReportService } from './staff-services-revenue-report.service';

import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [AuditModule, StaffModule],
  controllers: [DashboardReportsController],
  providers: [ReportsService, StaffServicesRevenueReportService],
})
export class ReportsModule {}
