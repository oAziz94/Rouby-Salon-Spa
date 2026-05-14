import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DailyClosingCloseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
