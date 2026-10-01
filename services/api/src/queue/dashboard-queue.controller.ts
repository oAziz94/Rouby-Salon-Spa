import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AppendQueueBookingItemsDto } from './dto/append-queue-booking-items.dto';
import { PatchQueueNotesDto } from './dto/patch-queue-notes.dto';
import { QueueListQueryDto } from './dto/queue-list-query.dto';
import { WalkInQueueDto } from './dto/walk-in-queue.dto';
import { QueueService } from './queue.service';
import { CreateInvoicePaymentDto } from '../billing/dto/create-invoice-payment.dto';
import { CompleteQueueEntryDto } from './dto/complete-queue-entry.dto';
import { StartQueueEntryDto } from './dto/start-queue-entry.dto';

@ApiTags('dashboard-queue')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/queue')
export class DashboardQueueController {
  constructor(private readonly queue: QueueService) {}

  @Get()
  @RequirePermissions('queue.read')
  @ApiOperation({ summary: 'Operational queue board (branch-scoped)' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: QueueListQueryDto,
  ) {
    return this.queue.listDashboardQueue(user, query);
  }

  @Post('walk-ins')
  @RequirePermissions('queue.manage', 'bookings.create')
  @ApiOperation({
    summary:
      'Walk-in check-in: creates same-day WALK_IN booking + queue entry (requires line items)',
  })
  createWalkIn(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: WalkInQueueDto,
  ) {
    return this.queue.createWalkIn(user, body);
  }

  @Post(':queueEntryId/items')
  @RequirePermissions(
    'queue.manage',
    'bookings.update',
    'bookingServiceItems.create',
  )
  @ApiOperation({
    summary:
      'Append priced booking lines for the visit linked to this queue row (WAITING / IN_SERVICE only)',
  })
  appendBookingItems(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
    @Body() body: AppendQueueBookingItemsDto,
  ) {
    return this.queue.appendQueueEntryBookingItems(user, queueEntryId, body);
  }

  @Patch(':queueEntryId')
  @RequirePermissions('queue.manage')
  @ApiOperation({ summary: 'Update queue entry notes' })
  patchNotes(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
    @Body() body: PatchQueueNotesDto,
  ) {
    return this.queue.patchNotes(user, queueEntryId, body);
  }

  @Post(':queueEntryId/start')
  @RequirePermissions(
    'queue.manage',
    'bookings.status.progress',
    'bookingServiceItems.start',
  )
  @ApiOperation({
    summary:
      'Start service (WAITING → IN_SERVICE). Booking-linked rows sync booking to IN_PROGRESS when permitted.',
  })
  start(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
    @Body() body: StartQueueEntryDto,
  ) {
    return this.queue.startQueueEntry(user, queueEntryId, body);
  }

  @Post(':queueEntryId/invoice/finalize')
  @RequirePermissions('queue.manage')
  @RequireAnyPermissions(
    'invoices.create_finalize',
    'invoices.create',
    'bookings.invoice.create',
  )
  @ApiOperation({ summary: 'Finalize invoice for queue-linked booking' })
  finalizeInvoice(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
  ) {
    return this.queue.finalizeInvoiceForQueueEntry(user, queueEntryId);
  }

  @Post(':queueEntryId/payments')
  @RequirePermissions('queue.manage')
  @RequireAnyPermissions('payments.record')
  @ApiOperation({
    summary: 'Collect payment for queue-linked finalized invoice',
  })
  recordPayment(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
    @Body() body: CreateInvoicePaymentDto,
  ) {
    return this.queue.recordPaymentForQueueEntry(user, queueEntryId, body);
  }

  @Post(':queueEntryId/complete')
  @RequirePermissions('queue.manage', 'bookings.status.progress')
  @ApiOperation({
    summary:
      'Complete visit. Booking-linked rows sync booking to COMPLETED when permitted.',
  })
  complete(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
    @Body() body: CompleteQueueEntryDto,
  ) {
    return this.queue.completeQueueEntry(user, queueEntryId, body);
  }

  @Post(':queueEntryId/cancel')
  @RequirePermissions('queue.manage')
  @ApiOperation({ summary: 'Cancel queue entry (does not cancel booking)' })
  cancel(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId') queueEntryId: string,
  ) {
    return this.queue.cancelQueueEntry(user, queueEntryId);
  }
}
