import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WHATSAPP_TEMPLATE_CATEGORIES } from '../whatsapp-template-variables';

const CATEGORY_ENUM = [...WHATSAPP_TEMPLATE_CATEGORIES] as [string, ...string[]];

export class PatchWhatsappTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body?: string;

  @ApiPropertyOptional({ enum: CATEGORY_ENUM })
  @IsOptional()
  @IsString()
  @IsIn(CATEGORY_ENUM)
  category?: string;

  @ApiPropertyOptional({ enum: ['ar', 'en'] })
  @IsOptional()
  @IsString()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, string> | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTemplateName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  metaTemplateStatus?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresMetaApproval?: boolean;
}
