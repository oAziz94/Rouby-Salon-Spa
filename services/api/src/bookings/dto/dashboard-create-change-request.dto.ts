import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChangeRequestType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class DashboardCreateChangeRequestDto {
  @ApiProperty({ enum: BookingChangeRequestType })
  @IsEnum(BookingChangeRequestType)
  requestType!: BookingChangeRequestType;

  @ApiPropertyOptional({
    description:
      'Required when requestType is RESCHEDULE; must be a slot in the same branch as the booking.',
  })
  @ValidateIf(
    (o: DashboardCreateChangeRequestDto) =>
      o.requestType === BookingChangeRequestType.RESCHEDULE,
  )
  @IsUUID('4')
  requestedSlotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
