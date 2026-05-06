import { Module } from '@nestjs/common';
import { DashboardAuditLogsController } from './dashboard-audit-logs.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [DashboardAuditLogsController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
