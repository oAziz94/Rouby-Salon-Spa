import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DailyClosingCloseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Required (ALERT policy) when visits are still open or invoices unpaid: why they are carried over.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  carryOverReason?: string;
}
