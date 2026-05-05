import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class PatchSlotDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
