import { Module } from '@nestjs/common';
import { DashboardMediaController } from './dashboard-media.controller';
import { MediaUploadService } from './media-upload.service';

@Module({
  controllers: [DashboardMediaController],
  providers: [MediaUploadService],
  exports: [MediaUploadService],
})
export class MediaModule {}
