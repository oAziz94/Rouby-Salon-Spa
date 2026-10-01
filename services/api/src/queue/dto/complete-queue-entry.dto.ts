import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteQueueEntryDto {
  @ApiPropertyOptional({
    description:
      'Required to close a visit while the invoice still has a balance (SOFT rule, spec v2 §4).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  closeWithBalanceReason?: string;
}
