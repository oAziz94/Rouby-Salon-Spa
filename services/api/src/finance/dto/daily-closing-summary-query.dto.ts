import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class DailyClosingSummaryQueryDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  date!: string;
}
