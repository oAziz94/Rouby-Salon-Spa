import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashDrawerMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CashDrawerMovementDto {
  @ApiProperty({ enum: CashDrawerMovementType })
  @IsEnum(CashDrawerMovementType)
  type!: CashDrawerMovementType;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
