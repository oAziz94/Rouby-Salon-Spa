import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class DailyClosingDraftDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  businessDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
