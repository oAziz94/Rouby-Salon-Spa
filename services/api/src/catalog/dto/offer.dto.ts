import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OfferAppliesTo, OfferDiscountType } from '@prisma/client';

export class CreateOfferDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  offerCode?: string | null;

  @IsEnum(OfferDiscountType)
  discountType!: OfferDiscountType;

  @IsNumber()
  @Min(0)
  discountValue!: number;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  usageLimit?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  perClientUsageLimit?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumSpend?: number | null;

  @IsOptional()
  @IsEnum(OfferAppliesTo)
  appliesTo?: OfferAppliesTo;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  packageIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  eligibilityRules?: Record<string, unknown> | null;
}

export class PatchOfferDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  offerCode?: string | null;

  @IsOptional()
  @IsEnum(OfferDiscountType)
  discountType?: OfferDiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  usageLimit?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  perClientUsageLimit?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumSpend?: number | null;

  @IsOptional()
  @IsEnum(OfferAppliesTo)
  appliesTo?: OfferAppliesTo;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  packageIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  eligibilityRules?: Record<string, unknown> | null;
}
