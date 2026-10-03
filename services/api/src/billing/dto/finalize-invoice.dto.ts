import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizeInvoiceDto {
  @ApiPropertyOptional({
    description:
      'Required to finalize while a service line is still pending or in progress (SOFT rule).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
