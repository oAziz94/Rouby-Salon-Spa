import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { FinalizeInvoiceDto } from './dto/finalize-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('dashboard-booking-invoices')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/bookings')
export class DashboardBookingInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post(':bookingId/invoices')
  @RequireAnyPermissions(
    'invoices.create_finalize',
    'invoices.create',
    'bookings.invoice.create',
  )
  @ApiOperation({
    summary: 'Create a finalized invoice from booking snapshots',
  })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: FinalizeInvoiceDto,
  ) {
    return this.invoices.createFinalizedForBooking(
      user,
      bookingId,
      body?.overrideReason,
    );
  }

  @Post(':bookingId/invoice/finalize')
  @RequireAnyPermissions(
    'invoices.create_finalize',
    'invoices.create',
    'bookings.invoice.create',
  )
  @ApiOperation({
    summary:
      'Finalize invoice from booking snapshots (alias endpoint for queue flow)',
  })
  finalize(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: FinalizeInvoiceDto,
  ) {
    return this.invoices.createFinalizedForBooking(
      user,
      bookingId,
      body?.overrideReason,
    );
  }
}
