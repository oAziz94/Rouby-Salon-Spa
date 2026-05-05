import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class WhatsappDeepLinkDto {
  @ApiProperty({ example: 'BOOKING_CONFIRMED' })
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
}
