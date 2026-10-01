import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { BookingsService } from './bookings.service';
import { DashboardBookingListQueryDto } from './dto/dashboard-booking-list-query.dto';
import { DashboardCreateBookingDto } from './dto/dashboard-create-booking.dto';
import { DashboardCreateChangeRequestDto } from './dto/dashboard-create-change-request.dto';
import { DiscountBodyDto } from './dto/discount-body.dto';
import { RescheduleBodyDto } from './dto/reschedule-body.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';
import { StartBookingServiceItemDto } from './dto/start-booking-service-item.dto';
import { AppendBookingServiceItemsDto } from './dto/append-booking-service-items.dto';

@ApiTags('dashboard-bookings')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/bookings')
export class DashboardBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'List bookings (branch-scoped)' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: DashboardBookingListQueryDto,
  ) {
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

  @Post(':bookingId/change-requests')
  @RequirePermissions('bookings.update')
  @ApiOperation({
    summary:
      'Create a pending cancel or reschedule request for a booking (staff-initiated; same approve flow as client requests)',
  })
  createChangeRequest(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: DashboardCreateChangeRequestDto,
  ) {
    return this.bookings.dashboardCreateChangeRequest(user, bookingId, body);
  }

  @Post(':bookingId/confirm')
  @RequirePermissions('bookings.confirm')
  @ApiOperation({ summary: 'Confirm pending booking' })
  confirm(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: ConfirmBookingDto,
  ) {
    return this.bookings.confirmBooking(user, bookingId, body?.overrideReason);
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

  @Post(':bookingId/reschedule')
  @RequirePermissions('bookings.reschedule')
  @ApiOperation({
    summary: 'Reschedule booking (→ RESCHEDULED, capacity rules)',
  })
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

  @Post(':bookingId/service-items')
  @RequirePermissions('bookingServiceItems.create', 'bookings.update')
  @ApiOperation({
    summary:
      'Append priced booking lines while visit is on the queue (same rules as queue items append)',
  })
  appendServiceItems(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: AppendBookingServiceItemsDto,
  ) {
    return this.bookings.appendServiceItemsForActiveQueue(
      user,
      bookingId,
      body.items,
    );
  }

  @Post(':bookingId/service-items/:itemId/start')
  @RequirePermissions('bookingServiceItems.start')
  @ApiOperation({
    summary: 'Assign staff and start a PENDING booking service line',
  })
  startServiceItem(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Param('itemId') itemId: string,
    @Body() body: StartBookingServiceItemDto,
  ) {
    return this.bookings.startBookingServiceItem(
      user,
      bookingId,
      itemId,
      body.staffProfileId,
      body.overrideReason,
    );
  }

  @Post(':bookingId/service-items/:itemId/complete')
  @RequirePermissions('bookingServiceItems.complete')
  @ApiOperation({
    summary: 'Mark an IN_PROGRESS booking service line as completed',
  })
  completeServiceItem(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.bookings.completeBookingServiceItem(user, bookingId, itemId);
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

  @Delete(':bookingId/items/:itemId')
  @RequirePermissions('bookings.update')
  @ApiOperation({
    summary:
      'Remove a single line item from a booking and reprice (blocks on terminal state, finalized invoice, or last item)',
  })
  removeItem(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId') bookingId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.bookings.removeBookingItem(user, bookingId, itemId);
  }
}
