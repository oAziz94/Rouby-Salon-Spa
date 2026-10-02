import { ApiPropertyOptional } from '@nestjs/swagger';
import { DayCloseOpenItemsPolicy } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class PatchOperationsSettingsDto {
  @ApiPropertyOptional({
    enum: DayCloseOpenItemsPolicy,
    description:
      'ALERT: the day can be closed with open visits / unpaid invoices if a carry-over reason is given. BLOCK: it cannot.',
  })
  @IsOptional()
  @IsEnum(DayCloseOpenItemsPolicy)
  dayCloseOpenItemsPolicy?: DayCloseOpenItemsPolicy;

  @ApiPropertyOptional({
    description:
      'Largest discount (% of subtotal) reception may apply without a manager.',
    example: 15,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountLimitPercentWithoutApproval?: number;
}
