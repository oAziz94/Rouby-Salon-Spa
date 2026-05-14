import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WHATSAPP_TEMPLATE_CATEGORIES } from '../whatsapp-template-variables';

const CATEGORY_ENUM = [...WHATSAPP_TEMPLATE_CATEGORIES] as [string, ...string[]];

export class CreateWhatsappTemplateDto {
  @ApiProperty({ example: 'Booking confirmation (Arabic)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'BOOKING_CONFIRMED_V2' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  templateKey!: string;

  @ApiProperty({
    description: 'Message body with {{clientName}} or {clientName} placeholders',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  body!: string;

  @ApiProperty({ enum: CATEGORY_ENUM })
  @IsString()
  @IsIn(CATEGORY_ENUM)
  category!: string;

  @ApiProperty({ enum: ['ar', 'en'] })
  @IsString()
  @IsIn(['ar', 'en'])
  language!: 'ar' | 'en';

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
  sampleData?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'JSON-serializable list of variable names (strings)',
    type: [String],
    example: ['clientName', 'bookingDate'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ default: true })
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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresMetaApproval?: boolean;
}
