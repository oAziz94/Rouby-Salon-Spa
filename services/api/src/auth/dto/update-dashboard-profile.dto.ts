import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateDashboardProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}
