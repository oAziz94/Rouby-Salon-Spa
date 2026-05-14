import { ReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PatchDashboardReviewDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  quote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceName?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  status?: ReviewStatus;
}
