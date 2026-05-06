import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardBookingInvoicesController } from './dashboard-booking-invoices.controller';
import { DashboardBookingPaymentsController } from './dashboard-booking-payments.controller';
import { DashboardInvoicesController } from './dashboard-invoices.controller';
import { DashboardPaymentsController } from './dashboard-payments.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    DashboardBookingPaymentsController,
    DashboardBookingInvoicesController,
    DashboardPaymentsController,
    DashboardInvoicesController,
  ],
  providers: [InvoicesService, PaymentsService],
  exports: [InvoicesService, PaymentsService],
})
export class BillingModule {}
