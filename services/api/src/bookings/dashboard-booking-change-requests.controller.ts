import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { BookingsService } from './bookings.service';
import { ChangeRequestListQueryDto } from './dto/change-request-list-query.dto';

@ApiTags('dashboard-booking-change-requests')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/booking-change-requests')
export class DashboardBookingChangeRequestsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'List client booking change requests' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ChangeRequestListQueryDto,
  ) {
    return this.bookings.listChangeRequests(user, query);
  }

  @Get(':requestId')
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'Get change request detail' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('requestId') requestId: string,
  ) {
    return this.bookings.getChangeRequest(user, requestId);
  }

  @Post(':requestId/approve')
  @RequirePermissions('bookings.read')
  @ApiOperation({
    summary:
      'Approve pending request (executes cancel/reschedule; requires bookings.cancel or bookings.reschedule in service)',
  })
  approve(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('requestId') requestId: string,
  ) {
    return this.bookings.approveChangeRequest(user, requestId);
  }

  @Post(':requestId/reject')
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'Reject pending request' })
  reject(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('requestId') requestId: string,
  ) {
    return this.bookings.rejectChangeRequest(user, requestId);
  }

  @Post(':requestId/cancel')
  @RequirePermissions('bookings.read')
  @ApiOperation({ summary: 'Cancel (void) pending request' })
  cancel(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('requestId') requestId: string,
  ) {
    return this.bookings.cancelChangeRequest(user, requestId);
  }
}
