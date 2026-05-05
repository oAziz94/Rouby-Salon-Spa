import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DiscountBodyDto {
  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
