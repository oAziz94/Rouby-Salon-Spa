import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StaffScheduleExceptionType } from '@prisma/client';

export class PatchStaffExceptionDto {
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ enum: StaffScheduleExceptionType })
  @IsOptional()
  @IsEnum(StaffScheduleExceptionType)
  type?: StaffScheduleExceptionType;

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
