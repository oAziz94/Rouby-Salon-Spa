import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { DashboardCmsController } from './dashboard-cms.controller';
import { DashboardGalleryController } from './dashboard-gallery.controller';
import { DashboardReviewsController } from './dashboard-reviews.controller';
import { DashboardWebsiteContentController } from './dashboard-website-content.controller';
import { PublicContentController } from './public-content.controller';
import { ContentService } from './content.service';
import { GalleryAdminService } from './gallery-admin.service';
import { WebsiteContentService } from './website-content.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [
    PublicContentController,
    DashboardGalleryController,
    DashboardReviewsController,
    DashboardCmsController,
    DashboardWebsiteContentController,
  ],
  providers: [ContentService, GalleryAdminService, WebsiteContentService],
})
export class ContentModule {}
