import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type InvoicePaymentStatusFilter = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

const PAYMENT_STATUSES: InvoicePaymentStatusFilter[] = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
];

export class InvoiceListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  bookingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({ description: 'Invoice createdAt from (ISO date)' })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Invoice createdAt to (ISO date)' })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Free-text search across invoice number, client name/phone, and booking reference fragment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: InvoicePaymentStatusFilter;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

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
