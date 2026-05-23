import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ReportRangeQueryDto } from './report-range-query.dto';

export const STAFF_REVENUE_SOURCE_VALUES = [
  'all',
  'booking',
  'walkin',
] as const;
export type StaffRevenueSourceFilter =
  (typeof STAFF_REVENUE_SOURCE_VALUES)[number];

export class StaffServicesRevenueQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ enum: STAFF_REVENUE_SOURCE_VALUES })
  @IsOptional()
  @IsIn(STAFF_REVENUE_SOURCE_VALUES)
  source?: StaffRevenueSourceFilter;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  invoiceStatus?: InvoiceStatus;
}
