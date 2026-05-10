import { IsString, Matches } from 'class-validator';
import { SlotGenerationOverridesDto } from './slot-generation-overrides.dto';

export class GenerateWeekSlotsDto extends SlotGenerationOverridesDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStartDate!: string;
}
