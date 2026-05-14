import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { GalleryItemLibraryStatus } from '@prisma/client';
import { ContentPaginationQueryDto } from './content-pagination-query.dto';

export type GalleryUsageBucket =
  | 'unused'
  | 'services'
  | 'homepage'
  | 'other_sections';

export class DashboardGalleryListQueryDto extends ContentPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  usageType?: string;

  @IsOptional()
  @IsString()
  usageBucket?: GalleryUsageBucket;

  @IsOptional()
  @IsEnum(GalleryItemLibraryStatus)
  libraryStatus?: GalleryItemLibraryStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') {
      return true;
    }
    if (value === false || value === 'false') {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}
