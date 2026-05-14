import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartBookingServiceItemDto {
  @ApiProperty()
  @IsUUID()
  staffProfileId!: string;
}
