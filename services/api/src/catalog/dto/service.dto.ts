import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PriceDisplayType } from '@prisma/client';

export class ServiceBenefitUpsertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
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

export class CreateServiceDto {
  @IsUUID()
  categoryId!: string;

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
  @IsUUID()
  imageMediaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageAlt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  badgeLabel?: string | null;

  @IsEnum(PriceDisplayType)
  priceDisplayType!: PriceDisplayType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePriceMax?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  bookingAvailability?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preparationNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aftercareNotes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @IsUUID('4', { each: true })
  branchIds!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceBenefitUpsertDto)
  benefits?: ServiceBenefitUpsertDto[];
}

export class PatchServiceDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsUUID()
  imageMediaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageAlt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  badgeLabel?: string | null;

  @IsOptional()
  @IsEnum(PriceDisplayType)
  priceDisplayType?: PriceDisplayType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePriceMax?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  bookingAvailability?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preparationNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aftercareNotes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  /** When provided (including empty array), replaces all benefit rows for this service. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceBenefitUpsertDto)
  benefits?: ServiceBenefitUpsertDto[];
}

export class CreateServiceVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PatchServiceVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
