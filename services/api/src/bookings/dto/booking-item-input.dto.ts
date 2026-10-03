import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookingItemInputDto {
  @ApiProperty({ enum: BookingItemType })
  @IsEnum(BookingItemType)
  itemType!: BookingItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  serviceVariantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  packageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  bundleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  serviceEnhancementId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  /** For `FLEXIBLE` bundles: must match `Bundle.selectableCount` and eligible services. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedServiceIds?: string[];

  /**
   * Dashboard / staff flows only (ignored for public website pricing).
   * Unit price (EGP) when the catalog has no bookable online price (contact/hidden, range without variant, or missing base).
   */
  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999.99)
  staffOverrideUnitPrice?: number;

  /**
   * Dashboard / staff flows only: duration in minutes when overriding catalog duration (optional if service has duration).
   */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  staffOverrideDurationMinutes?: number;
}

export class PublicBookingEstimateBodyDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ type: [BookingItemInputDto] })
  @ValidateNested({ each: true })
  @Type(() => BookingItemInputDto)
  @ArrayMinSize(1)
  items!: BookingItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;
}

export class PublicBookingCreateBodyDto extends PublicBookingEstimateBodyDto {
  @ApiProperty()
  @IsUUID('4')
  slotId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  clientNotes?: string;
}
