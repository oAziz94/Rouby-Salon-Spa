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
import { Type } from 'class-transformer';

export class CreateDashboardReviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  quote!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceName?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;
}
