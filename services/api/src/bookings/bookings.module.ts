import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { BookingPricingService } from './booking-pricing.service';
import { BookingsService } from './bookings.service';
import { ClientBookingsController } from './client-bookings.controller';
import { DashboardBookingChangeRequestsController } from './dashboard-booking-change-requests.controller';
import { DashboardBookingsController } from './dashboard-bookings.controller';
import { PublicBookingsController } from './public-bookings.controller';

@Module({
  imports: [PrismaModule, SlotsModule, AuthModule],
  controllers: [
    PublicBookingsController,
    ClientBookingsController,
    DashboardBookingsController,
    DashboardBookingChangeRequestsController,
  ],
  providers: [BookingsService, BookingPricingService],
  exports: [BookingsService],
})
export class BookingsModule {}
