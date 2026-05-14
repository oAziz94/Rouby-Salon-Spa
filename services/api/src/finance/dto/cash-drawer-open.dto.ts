import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CashDrawerOpenDto {
  @ApiProperty()
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ description: 'Business date YYYY-MM-DD (UTC calendar day)' })
  @IsString()
  @MaxLength(10)
  businessDate!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
