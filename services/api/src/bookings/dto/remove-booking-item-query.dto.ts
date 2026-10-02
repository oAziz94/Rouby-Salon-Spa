import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RemoveBookingItemQueryDto {
  @ApiPropertyOptional({
    description:
      'Required to stop and remove a line that is already IN_PROGRESS (SOFT rule). Recorded in the audit log.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
