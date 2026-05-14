import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { QueueService } from './queue.service';

@ApiTags('dashboard-queue')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/bookings')
export class DashboardBookingQueueController {
  constructor(private readonly queue: QueueService) {}

  @Post(':bookingId/check-in')
  @RequirePermissions('queue.manage', 'bookings.status.progress')
  @ApiOperation({
    summary:
      'Check booking into today queue (WAITING). Optionally transitions CONFIRMED/RESCHEDULED → ARRIVED.',
  })
  checkIn(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.queue.checkInFromBooking(user, bookingId);
  }
}
