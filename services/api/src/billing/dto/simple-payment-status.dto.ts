import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min, ValidateIf } from 'class-validator';

export type SimplePaymentAggregateStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export class SimplePaymentStatusDto {
  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] })
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID'])
  paymentStatus!: SimplePaymentAggregateStatus;

  @ApiPropertyOptional({
    description: 'Required when paymentStatus is PARTIALLY_PAID',
  })
  @ValidateIf(
    (o: SimplePaymentStatusDto) => o.paymentStatus === 'PARTIALLY_PAID',
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;
}
