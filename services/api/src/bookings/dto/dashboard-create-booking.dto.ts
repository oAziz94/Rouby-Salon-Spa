import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingSource, BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BookingItemInputDto } from './booking-item-input.dto';

export class DashboardCreateBookingDto {
  @ApiProperty()
  @IsUUID('4')
  clientId!: string;

  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty()
  @IsUUID('4')
  slotId!: string;

  @ApiProperty({ enum: BookingSource })
  @IsEnum(BookingSource)
  source!: BookingSource;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'Defaults to PENDING. Use CONFIRMED to consume slot capacity immediately.',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  initialStatus?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  clientNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  adminNotes?: string;

  @ApiProperty({ type: [BookingItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingItemInputDto)
  @ArrayMinSize(1)
  items!: BookingItemInputDto[];
}
