import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PickerCatalogQueryDto {
  @ApiPropertyOptional({
    description: 'Limit services/packages to one branch.',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}

export class CatalogSearchTermsParamsDto {
  @IsIn(['service', 'variant', 'package', 'enhancement'])
  kind!: 'service' | 'variant' | 'package' | 'enhancement';

  @IsUUID('4')
  id!: string;
}

export class PatchCatalogSearchTermsDto {
  @ApiPropertyOptional({ description: 'Arabic display/search name.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Extra search words, e.g. ["mani", "مانيكير"].',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  searchAliases?: string[];
}
