import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientJwtAuthGuard } from '../auth/guards/client-jwt-auth.guard';
import { CurrentClient } from '../auth/decorators/current-client.decorator';
import type { ClientJwtUser } from '../auth/client-jwt-user';
import { BookingsService } from './bookings.service';
import type { PublicBookingCreateBodyDto } from './dto/booking-item-input.dto';
import type { PublicBookingEstimateBodyDto } from './dto/booking-item-input.dto';

@ApiTags('public-bookings')
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Estimate booking totals (no persistence)' })
  estimate(@Body() body: PublicBookingEstimateBodyDto) {
    return this.bookings.estimatePublic(body);
  }

  @Post()
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth('client-jwt')
  @ApiOperation({
    summary: 'Submit website booking (PENDING, requires client JWT + phone)',
  })
  create(
    @CurrentClient() client: ClientJwtUser,
    @Body() body: PublicBookingCreateBodyDto,
  ) {
    return this.bookings.createPublicBooking(client, body);
  }
}
