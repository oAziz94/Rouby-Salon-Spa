import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ContentPaginationQueryDto } from './content-pagination-query.dto';

export class DashboardGalleryListQueryDto extends ContentPaginationQueryDto {
  @IsOptional()
  category?: string;

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
