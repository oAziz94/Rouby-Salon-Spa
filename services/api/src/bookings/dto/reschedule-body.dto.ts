import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RescheduleBodyDto {
  @ApiProperty()
  @IsUUID('4')
  slotId!: string;

  @ApiPropertyOptional({
    description:
      'Required to move to a slot that already started today, or one the client already holds (SOFT rules).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
