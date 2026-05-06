import { Module } from '@nestjs/common';
import { DashboardCmsController } from './dashboard-cms.controller';
import { DashboardGalleryController } from './dashboard-gallery.controller';
import { DashboardReviewsController } from './dashboard-reviews.controller';
import { PublicContentController } from './public-content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [
    PublicContentController,
    DashboardGalleryController,
    DashboardReviewsController,
    DashboardCmsController,
  ],
  providers: [ContentService],
})
export class ContentModule {}
