import { BookingSlotStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class CreateSlotDto {
  @IsDateString()
  date!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  startTime!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsBoolean()
  isOnlineBookable?: boolean;

  @IsOptional()
  @IsEnum(BookingSlotStatus)
  status?: BookingSlotStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
