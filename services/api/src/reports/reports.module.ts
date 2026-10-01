import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardOverviewTodayController } from './dashboard-overview-today.controller';
import { DashboardReportsController } from './dashboard-reports.controller';
import { OverviewTodayService } from './overview-today.service';
import { ReportsService } from './reports.service';
import { StaffServicesRevenueReportService } from './staff-services-revenue-report.service';

import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [AuditModule, StaffModule],
  controllers: [DashboardReportsController, DashboardOverviewTodayController],
  providers: [
    ReportsService,
    StaffServicesRevenueReportService,
    OverviewTodayService,
  ],
})
export class ReportsModule {}
