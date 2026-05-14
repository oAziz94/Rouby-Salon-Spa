import { IsBoolean } from 'class-validator';

export class PatchDashboardReviewHomepageDto {
  @IsBoolean()
  showOnHomepage!: boolean;
}
