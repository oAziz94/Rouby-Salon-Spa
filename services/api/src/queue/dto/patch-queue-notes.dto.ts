import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchQueueNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
