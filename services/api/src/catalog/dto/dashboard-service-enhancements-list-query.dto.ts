import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  return value;
}

export class DashboardServiceEnhancementsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : undefined,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMin?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMax?: number;
}
