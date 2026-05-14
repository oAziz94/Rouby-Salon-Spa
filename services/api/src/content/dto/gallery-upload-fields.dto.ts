import { Transform } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Optional multipart text fields alongside `file` on POST /dashboard/gallery/upload */
export class DashboardGalleryUploadFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** Comma-separated tags from multipart text field */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tagsRaw?: string;
}
