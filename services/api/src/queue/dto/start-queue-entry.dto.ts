import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class QueueStartServiceLineDto {
  @ApiProperty()
  @IsUUID()
  bookingItemId!: string;

  @ApiProperty()
  @IsUUID()
  staffProfileId!: string;

  @ApiPropertyOptional({
    description: 'Reason when overriding a SOFT staff check.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}

export class StartQueueEntryDto {
  @ApiProperty({
    type: [QueueStartServiceLineDto],
    description:
      'Assign staff and start exactly one PENDING catalog service line when moving a booking-linked visit from WAITING to IN_SERVICE (additional lines are started later, one at a time)',
    required: false,
    default: [],
  })
  @Transform(({ value }: { value: unknown }): unknown[] =>
    Array.isArray(value) ? value : [],
  )
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueStartServiceLineDto)
  starts: QueueStartServiceLineDto[] = [];

  @ApiPropertyOptional({
    description: 'Reason applied to every line in starts[].',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
