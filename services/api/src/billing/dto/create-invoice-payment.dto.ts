import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInvoicePaymentDto {
  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({
    enum: [
      PaymentMethod.CASH,
      PaymentMethod.CARD,
      PaymentMethod.INSTAPAY,
      PaymentMethod.MOBILE_WALLET,
      PaymentMethod.BANK_TRANSFER,
    ],
  })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
