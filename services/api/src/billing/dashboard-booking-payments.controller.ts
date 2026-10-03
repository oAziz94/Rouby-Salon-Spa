import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SimplePaymentStatusDto } from './dto/simple-payment-status.dto';
import { PaymentsService } from './payments.service';

@ApiTags('dashboard-booking-payments')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/bookings')
export class DashboardBookingPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':bookingId/payments')
  @RequirePermissions('payments.record')
  @ApiOperation({ summary: 'Record a manual payment for a booking' })
  record(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: CreatePaymentDto,
  ) {
    return this.payments.recordPayment(user, bookingId, body);
  }

  @Get(':bookingId/payments')
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'List payments for a booking' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.payments.listForBooking(user, bookingId);
  }

  @Patch(':bookingId/payment-status')
  @RequirePermissions('payments.record_simple')
  @ApiOperation({ summary: 'Simple payment status (receptionist)' })
  simpleStatus(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: SimplePaymentStatusDto,
  ) {
    return this.payments.applySimplePaymentStatus(user, bookingId, body);
  }
}
