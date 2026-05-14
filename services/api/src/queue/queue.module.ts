import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ClientsModule } from '../clients/clients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { BillingModule } from '../billing/billing.module';
import { StaffModule } from '../staff/staff.module';
import { DashboardBookingQueueController } from './dashboard-booking-queue.controller';
import { DashboardQueueController } from './dashboard-queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    BookingsModule,
    ClientsModule,
    SlotsModule,
    BillingModule,
    StaffModule,
  ],
  controllers: [DashboardQueueController, DashboardBookingQueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
