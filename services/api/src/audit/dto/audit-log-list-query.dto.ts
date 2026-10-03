import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AuditLogListQueryDto {
  @ApiPropertyOptional({
    description:
      'Client name or phone, staff or user name/email, invoice number, booking reference, or action text',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['money', 'overrides', 'bookings', 'staff_users', 'settings'],
  })
  @IsOptional()
  @IsIn(['money', 'overrides', 'bookings', 'staff_users', 'settings'])
  category?: 'money' | 'overrides' | 'bookings' | 'staff_users' | 'settings';

  @ApiPropertyOptional({
    description: 'Only entries where a rule was bypassed',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  overridesOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Everything concerning one booking (its invoice, payments and visit included)',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({
    description: 'Everything concerning one client and their bookings',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

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

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD (a Cairo calendar day) or an ISO date/time',
  })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD (a Cairo calendar day) or an ISO date/time',
  })
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
