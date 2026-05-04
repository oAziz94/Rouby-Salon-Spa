import { ApiProperty } from '@nestjs/swagger';
import { PaymentDepositPolicy } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class PatchPaymentPolicyDto {
  @ApiProperty({
    enum: PaymentDepositPolicy,
    example: PaymentDepositPolicy.PAY_AT_SALON,
  })
  @IsEnum(PaymentDepositPolicy)
  paymentDepositPolicy!: PaymentDepositPolicy;
}
