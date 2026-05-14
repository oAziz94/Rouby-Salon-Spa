import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BookingItemInputDto } from '../../bookings/dto/booking-item-input.dto';

export class WalkInQueueDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({
    description:
      'Existing CRM client. When set, client name/phone snapshots come from this record (requires clients.read).',
  })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Required when clientId is omitted.',
  })
  @ValidateIf((o: WalkInQueueDto) => !o.clientId)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName?: string;

  @ApiPropertyOptional({ description: 'Normalized server-side when provided.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({ type: [BookingItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => BookingItemInputDto)
  items!: BookingItemInputDto[];
}
