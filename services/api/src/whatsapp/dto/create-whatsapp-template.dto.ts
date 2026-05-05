import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWhatsappTemplateDto {
  @ApiProperty({ example: 'Follow-up message' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'CUSTOM_FOLLOW_UP' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  templateKey!: string;

  @ApiProperty({ description: 'Body with {clientName}-style placeholders' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content!: string;

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
}
