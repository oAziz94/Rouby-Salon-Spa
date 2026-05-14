import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CashDrawerCurrentQueryDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsString()
  @MaxLength(10)
  date!: string;
}
