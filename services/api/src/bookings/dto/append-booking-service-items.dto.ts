import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { BookingItemInputDto } from './booking-item-input.dto';

export class AppendBookingServiceItemsDto {
  @ApiProperty({ type: [BookingItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingItemInputDto)
  items!: BookingItemInputDto[];
}
