import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class PreviewWhatsappTemplateDto {
  @ApiPropertyOptional({
    description: 'Optional sample key/value map merged over defaults',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, string>;
}
