import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListWhatsappTemplatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ enum: ['ar', 'en', 'all'] })
  @IsOptional()
  @IsIn(['ar', 'en', 'all'])
  language?: 'ar' | 'en' | 'all';

  @ApiPropertyOptional({ enum: ['all', 'true', 'false'] })
  @IsOptional()
  @IsIn(['all', 'true', 'false'])
  isActive?: 'all' | 'true' | 'false';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
