import { ReviewStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ContentPaginationQueryDto } from './content-pagination-query.dto';

export class DashboardReviewsListQueryDto extends ContentPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  showOnHomepage?: boolean;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  ratingLte?: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
