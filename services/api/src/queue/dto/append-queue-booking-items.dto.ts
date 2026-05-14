import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { BookingItemInputDto } from '../../bookings/dto/booking-item-input.dto';

export class AppendQueueBookingItemsDto {
  @ApiProperty({ type: [BookingItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingItemInputDto)
  items!: BookingItemInputDto[];
}
