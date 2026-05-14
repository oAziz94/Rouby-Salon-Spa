import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AuditLogListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  @IsOptional()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @ApiPropertyOptional({ description: 'ISO date/time' })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date/time' })
  @IsOptional()
  dateTo?: string;

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
  @Max(200)
  limit = 20;
}
