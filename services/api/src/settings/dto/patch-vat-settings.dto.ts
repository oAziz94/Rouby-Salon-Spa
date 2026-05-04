import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PatchVatSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vatEnabled?: boolean;

  /** Decimal fraction, e.g. 14% = 0.14. Range 0–1. */
  @ApiPropertyOptional({ example: 0.14 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 5 })
  @Min(0)
  @Max(1)
  defaultVatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pricesIncludeVat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showVatOnInvoice?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxRegistrationNumber?: string | null;
}
