import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PackageFeatureUpsertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePackageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  originalPrice!: number;

  @IsNumber()
  @Min(0)
  packagePrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number | null;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  badgeLabel?: string | null;

  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  branchIds!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageFeatureUpsertDto)
  features?: PackageFeatureUpsertDto[];
}

export class PatchPackageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packagePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number | null;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  badgeLabel?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  /** When set (including empty array), replaces all feature rows for this package. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageFeatureUpsertDto)
  features?: PackageFeatureUpsertDto[];
}
