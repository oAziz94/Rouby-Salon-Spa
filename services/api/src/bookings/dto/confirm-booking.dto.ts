import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmBookingDto {
  @ApiPropertyOptional({
    description:
      'Required to confirm into a slot that is already at capacity (SOFT rule).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
