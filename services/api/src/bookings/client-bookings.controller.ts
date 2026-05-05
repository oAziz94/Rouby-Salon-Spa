import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientJwtAuthGuard } from '../auth/guards/client-jwt-auth.guard';
import { CurrentClient } from '../auth/decorators/current-client.decorator';
import type { ClientJwtUser } from '../auth/client-jwt-user';
import { BookingsService } from './bookings.service';
import { ClientBookingListQueryDto } from './dto/client-booking-list-query.dto';
import { ClientRescheduleRequestDto } from './dto/client-reschedule-request.dto';

@ApiTags('client-bookings')
@ApiBearerAuth('client-jwt')
@UseGuards(ClientJwtAuthGuard)
@Controller('client/bookings')
export class ClientBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List my bookings' })
  list(
    @CurrentClient() client: ClientJwtUser,
    @Query() query: ClientBookingListQueryDto,
  ) {
    return this.bookings.listClientBookings(client, query);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Get booking detail' })
  getOne(
    @CurrentClient() client: ClientJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.getClientBooking(client, bookingId);
  }

  @Post(':bookingId/cancellation-requests')
  @ApiOperation({ summary: 'Request cancellation (24h rule, staff approval)' })
  cancelRequest(
    @CurrentClient() client: ClientJwtUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.createCancellationRequest(client, bookingId);
  }

  @Post(':bookingId/reschedule-requests')
  @ApiOperation({ summary: 'Request reschedule (24h rule, staff approval)' })
  rescheduleRequest(
    @CurrentClient() client: ClientJwtUser,
    @Param('bookingId') bookingId: string,
    @Body() body: ClientRescheduleRequestDto,
  ) {
    return this.bookings.createRescheduleRequest(client, bookingId, body);
  }
}
