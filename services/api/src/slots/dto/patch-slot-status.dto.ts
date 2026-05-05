import { BookingSlotStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class PatchSlotStatusDto {
  @IsEnum(BookingSlotStatus)
  status!: BookingSlotStatus;
}
