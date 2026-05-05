import { IsBoolean } from 'class-validator';

export class PatchSlotOnlineBookableDto {
  @IsBoolean()
  isOnlineBookable!: boolean;
}
