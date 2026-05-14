import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class StaffScheduleDayDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0=Sunday … 6=Saturday (Cairo)',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty()
  @IsBoolean()
  isWorking!: boolean;

  @ApiPropertyOptional({ description: 'Required when isWorking is true' })
  @ValidateIf((o: StaffScheduleDayDto) => o.isWorking)
  @Type(() => Date)
  startTime?: Date;

  @ApiPropertyOptional()
  @ValidateIf((o: StaffScheduleDayDto) => o.isWorking)
  @Type(() => Date)
  endTime?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  breakStartTime?: Date | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  breakEndTime?: Date | null;
}

export class PutStaffScheduleDto {
  @ApiProperty({ type: [StaffScheduleDayDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffScheduleDayDto)
  days!: StaffScheduleDayDto[];
}
