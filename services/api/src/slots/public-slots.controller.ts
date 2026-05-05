import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicSlotsQueryDto } from './dto/public-slots-query.dto';
import { SlotsService } from './slots.service';

@ApiTags('public-booking-slots')
@Controller('public/branches/:branchId/slots')
export class PublicSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @ApiOperation({ summary: 'List online booking slots for a date' })
  listPublicSlots(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PublicSlotsQueryDto,
  ) {
    return this.slots.listPublicSlots(branchId, query.date);
  }
}
