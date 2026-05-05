import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class PatchSlotCapacityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;
}
