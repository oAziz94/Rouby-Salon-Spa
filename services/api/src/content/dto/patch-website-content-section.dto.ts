import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

function emptyStringToNull(v: unknown): unknown {
  if (v === '') return null;
  return v;
}

export class PatchWebsiteContentSectionDto {
  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(500)
  title?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(500)
  subtitle?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(200)
  eyebrow?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(200)
  ctaLabel?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(2000)
  ctaHref?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(200)
  secondaryCtaLabel?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsString()
  @MaxLength(2000)
  secondaryCtaHref?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsUUID()
  primaryGalleryItemId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsUUID()
  secondaryGalleryItemId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Prisma.InputJsonValue;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): boolean | undefined => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
