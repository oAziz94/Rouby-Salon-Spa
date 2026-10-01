import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartBookingServiceItemDto {
  @ApiProperty()
  @IsUUID()
  staffProfileId!: string;

  @ApiPropertyOptional({
    description:
      'Required to proceed when the staff member is off shift, busy, or not listed for the service (SOFT rule).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
