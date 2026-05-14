import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { MediaUploadService } from './media-upload.service';

const upload = memoryStorage();

@ApiTags('dashboard-media')
@Controller('dashboard/media')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardMediaController {
  constructor(private readonly media: MediaUploadService) {}

  @Post('upload')
  @RequirePermissions('services.manage')
  @ApiOperation({
    summary:
      'Upload an image (JPEG, PNG, WebP) for catalog use (e.g. service hero)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file field name: file',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: upload,
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Expected multipart field "file"');
    }
    return this.media.saveDashboardImage(file);
  }
}
