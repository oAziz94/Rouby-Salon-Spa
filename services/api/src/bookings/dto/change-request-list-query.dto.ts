import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChangeRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ChangeRequestListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ enum: BookingChangeRequestStatus })
  @IsOptional()
  @IsEnum(BookingChangeRequestStatus)
  status?: BookingChangeRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  bookingId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
