import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';

export class QueueStartServiceLineDto {
  @ApiProperty()
  @IsUUID()
  bookingItemId!: string;

  @ApiProperty()
  @IsUUID()
  staffProfileId!: string;
}

export class StartQueueEntryDto {
  @ApiProperty({
    type: [QueueStartServiceLineDto],
    description:
      'Assign staff and start exactly one PENDING catalog service line when moving a booking-linked visit from WAITING to IN_SERVICE (additional lines are started later, one at a time)',
    required: false,
    default: [],
  })
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueStartServiceLineDto)
  starts: QueueStartServiceLineDto[] = [];
}
