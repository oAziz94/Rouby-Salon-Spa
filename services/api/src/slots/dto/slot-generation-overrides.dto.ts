import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SLOT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class BreakPeriodDto {
  @IsString()
  @Matches(SLOT_TIME_PATTERN)
  startTime!: string;

  @IsString()
  @Matches(SLOT_TIME_PATTERN)
  endTime!: string;
}

/** Optional fields used by PATCH slot-generation and POST generate-week overrides. */
export class SlotGenerationOverridesDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'workingDays must not be empty when provided' })
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @Type(() => Number)
  workingDays?: number[];

  @IsOptional()
  @IsString()
  @Matches(SLOT_TIME_PATTERN)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(SLOT_TIME_PATTERN)
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  slotDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  defaultCapacity?: number;

  @IsOptional()
  @IsBoolean()
  defaultOnlineBookable?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BreakPeriodDto)
  breakPeriods?: BreakPeriodDto[];
}
