import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StaffScheduleExceptionType } from '@prisma/client';

export class CreateStaffExceptionDto {
  @ApiProperty({ type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiProperty({ enum: StaffScheduleExceptionType })
  @IsEnum(StaffScheduleExceptionType)
  type!: StaffScheduleExceptionType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTime?: Date | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endTime?: Date | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
