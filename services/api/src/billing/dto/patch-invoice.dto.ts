import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

export class PatchInvoiceDto {
  @ApiPropertyOptional({ enum: [InvoiceStatus.CANCELLED] })
  @IsOptional()
  @IsIn([InvoiceStatus.CANCELLED])
  status?: InvoiceStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;
}
