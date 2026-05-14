import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DashboardWebsiteContentListQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isVisible?: boolean;
}
