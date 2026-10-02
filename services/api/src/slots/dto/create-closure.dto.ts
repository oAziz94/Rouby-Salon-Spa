import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateClosureDto {
  @ApiProperty({ example: '2026-10-06' })
  @Matches(YMD, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({ example: '2026-10-06' })
  @Matches(YMD, { message: 'endDate must be YYYY-MM-DD' })
  endDate!: string;

  @ApiProperty({ example: 'Armed Forces Day' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason!: string;
}
