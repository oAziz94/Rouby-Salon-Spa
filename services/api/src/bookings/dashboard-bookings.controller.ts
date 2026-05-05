import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { BookingsService } from './bookings.service';
import { DashboardBookingListQueryDto } from './dto/dashboard-booking-list-query.dto';
import { DashboardCreateBookingDto } from './dto/dashboard-create-booking.dto';
import { DiscountBodyDto } from './dto/discount-body.dto';
import { RescheduleBodyDto } from './dto/reschedule-body.dto';

@ApiTags('dashboard-bookings')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/bookings')
export class DashboardBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'List bookings (branch-scoped)' })
  list(@CurrentDashboardUser() user: DashboardJwtUser, @Query() query: DashboardBookingListQueryDto) {
    return this.bookings.listDashboardBookings(user, query);
  }

  @Get(':bookingId')
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'Get booking detail' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.getDashboardBooking(user, bookingId);
  }

  @Post()
  @RequirePermissions('bookings.create')
  @ApiOperation({ summary: 'Create manual booking' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: DashboardCreateBookingDto,
  ) {
    return this.bookings.dashboardCreateBooking(user, body);
  }

  @Post(':bookingId/confirm')
  @RequirePermissions('bookings.confirm')
  @ApiOperation({ summary: 'Confirm pending booking' })
  confirm(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.confirmBooking(user, bookingId);
  }

  @Post(':bookingId/reject')
  @RequirePermissions('bookings.reject')
  @ApiOperation({ summary: 'Reject pending booking' })
  reject(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.rejectBooking(user, bookingId);
  }

  @Post(':bookingId/require-follow-up')
  @RequirePermissions('bookings.status.progress')
  @ApiOperation({ summary: 'Mark pending as requires follow-up' })
  requireFollowUp(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.requireFollowUp(user, bookingId);
  }

  @Post(':bookingId/reschedule')
  @RequirePermissions('bookings.reschedule')
  @ApiOperation({ summary: 'Reschedule booking (→ RESCHEDULED, capacity rules)' })
  reschedule(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: RescheduleBodyDto,
  ) {
    return this.bookings.rescheduleBooking(user, bookingId, body);
  }

  @Post(':bookingId/confirm-reschedule')
  @RequirePermissions('bookings.confirm')
  @ApiOperation({ summary: 'RESCHEDULED → CONFIRMED' })
  confirmReschedule(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.confirmReschedule(user, bookingId);
  }

  @Post(':bookingId/cancel')
  @RequirePermissions('bookings.cancel')
  @ApiOperation({ summary: 'Cancel booking' })
  cancel(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.cancelBooking(user, bookingId);
  }

  @Post(':bookingId/mark-arrived')
  @RequirePermissions('bookings.status.progress')
  @ApiOperation({ summary: 'Mark arrived' })
  markArrived(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.markArrived(user, bookingId);
  }

  @Post(':bookingId/mark-in-progress')
  @RequirePermissions('bookings.status.progress')
  @ApiOperation({ summary: 'Mark in progress' })
  markInProgress(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.markInProgress(user, bookingId);
  }

  @Post(':bookingId/mark-completed')
  @RequirePermissions('bookings.status.progress')
  @ApiOperation({ summary: 'Mark completed' })
  markCompleted(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.markCompleted(user, bookingId);
  }

  @Post(':bookingId/mark-no-show')
  @RequirePermissions('bookings.status.progress')
  @ApiOperation({ summary: 'Mark no-show' })
  markNoShow(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.markNoShow(user, bookingId);
  }

  @Post(':bookingId/recalculate-pricing')
  @RequirePermissions('bookings.update')
  @ApiOperation({ summary: 'Recalculate pricing from catalog (PENDING only)' })
  recalculate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.recalculatePricing(user, bookingId);
  }

  @Post(':bookingId/discount')
  @RequirePermissions('bookings.discount.apply')
  @ApiOperation({ summary: 'Apply manual discount' })
  discount(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: DiscountBodyDto,
  ) {
    return this.bookings.applyDiscount(user, bookingId, body);
  }
}
