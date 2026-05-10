import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  /** For `FLEXIBLE` bundles: must match `Bundle.selectableCount` and eligible services. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedServiceIds?: string[];
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
