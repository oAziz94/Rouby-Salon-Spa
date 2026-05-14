import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class WhatsappDeepLinkDto {
  @ApiProperty({
    example: 'BOOKING_CONFIRMED',
    description:
      'Logical key (e.g. BOOKING_CONFIRMED) or explicit suffixed key (BOOKING_CONFIRMED_EN). If not suffixed, `language` picks _EN vs _AR.',
  })
  @IsString()
  @IsNotEmpty()
  templateKey!: string;

  @ApiProperty({
    description: 'Required for Sprint 6 deep links (booking context).',
  })
  @IsUUID()
  bookingId!: string;

  @ApiPropertyOptional({
    description:
      'If set, must match the booking clientId or request is rejected.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    enum: ['ar', 'en'],
    default: 'en',
    description:
      'When `templateKey` has no _EN/_AR suffix, selects BOOKING_CONFIRMED_EN vs BOOKING_CONFIRMED_AR (fallback to the other language if missing).',
  })
  @IsOptional()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';
}
