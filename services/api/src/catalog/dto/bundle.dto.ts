import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BundleType } from '@prisma/client';

export class CreateBundleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsEnum(BundleType)
  bundleType!: BundleType;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown> | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  selectableCount!: number;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}

export class PatchBundleDto {
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
  @IsEnum(BundleType)
  bundleType?: BundleType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  selectableCount?: number;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];
}
