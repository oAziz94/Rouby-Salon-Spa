import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaymentListQueryDto {
  @ApiPropertyOptional({
    description:
      'Search invoice number, client name/phone, payment reference, or booking reference / id fragment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description:
      'Filter by paidAt (or createdAt if paidAt null), from ISO date',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter by paidAt (or createdAt if paidAt null), to ISO date',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
