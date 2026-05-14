import { GalleryItemLibraryStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PatchDashboardGalleryAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(GalleryItemLibraryStatus)
  libraryStatus?: GalleryItemLibraryStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
