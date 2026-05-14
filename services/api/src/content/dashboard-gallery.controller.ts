import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express, Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContentService } from './content.service';
import { DashboardGalleryListQueryDto } from './dto/dashboard-gallery-list-query.dto';
import { AttachGalleryAssetDto } from './dto/gallery-attach.dto';
import { DashboardGalleryUploadFieldsDto } from './dto/gallery-upload-fields.dto';
import {
  CreateGalleryItemDto,
  PatchGalleryItemDto,
  PatchGalleryStatusDto,
} from './dto/gallery.dto';
import { PatchDashboardGalleryAssetDto } from './dto/patch-dashboard-gallery-asset.dto';
import { GalleryAdminService } from './gallery-admin.service';

type AuthedRequest = Request & { user: DashboardJwtUser };

const uploadMemory = memoryStorage();

@ApiTags('dashboard-content-gallery')
@Controller('dashboard/gallery')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardGalleryController {
  constructor(
    private readonly content: ContentService,
    private readonly gallery: GalleryAdminService,
  ) {}

  @Get('stats')
  @RequirePermissions('gallery.read')
  @ApiOperation({ summary: 'Gallery / media library aggregate stats' })
  stats() {
    return this.gallery.statsDashboardGallery();
  }

  @Get()
  @RequirePermissions('gallery.read')
  @ApiOperation({ summary: 'List gallery / media assets' })
  list(@Query() query: DashboardGalleryListQueryDto) {
    return this.content.listDashboardGallery(query);
  }

  @Get(':id/usages')
  @RequirePermissions('gallery.read')
  @ApiOperation({ summary: 'List usages for an asset' })
  listUsages(@Param('id', ParseUUIDPipe) id: string) {
    return this.gallery.listUsages(id);
  }

  @Get(':id')
  @RequirePermissions('gallery.read')
  @ApiOperation({ summary: 'Get one gallery asset with usage list' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.gallery.getDashboardGalleryAsset(id);
  }

  @Post('upload')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Upload image into gallery (multipart)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        altText: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        tagsRaw: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadMemory,
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: DashboardGalleryUploadFieldsDto,
  ) {
    return this.gallery.uploadDashboardGallery(file, body, req.user);
  }

  @Post()
  @RequirePermissions('gallery.manage')
  @ApiOperation({
    summary: 'Create gallery item (legacy: URL must be salon upload)',
  })
  create(@Req() req: AuthedRequest, @Body() dto: CreateGalleryItemDto) {
    return this.content.createGalleryItem(dto, req.user);
  }

  @Patch(':id/status')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Activate/deactivate public gallery visibility' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchGalleryStatusDto,
  ) {
    return this.content.patchGalleryStatus(id, dto);
  }

  @Patch(':id/legacy')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Legacy patch (includes imageUrl when allowed)' })
  patchLegacy(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchGalleryItemDto,
  ) {
    return this.content.patchGalleryItem(id, dto, req.user);
  }

  @Patch(':id')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Update gallery asset metadata' })
  patchAsset(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchDashboardGalleryAssetDto,
  ) {
    return this.gallery.patchDashboardGalleryAsset(id, dto, req.user);
  }

  @Post(':id/attach')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Attach asset to service or homepage section' })
  attach(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachGalleryAssetDto,
  ) {
    return this.gallery.attachGalleryAsset(id, dto, req.user);
  }

  @Delete('usages/:usageId')
  @RequirePermissions('gallery.manage')
  @ApiOperation({
    summary: 'Detach usage',
    description:
      'Pass the usage row id, or synthetic id `svc-` + service UUID when only imageMediaId was set.',
  })
  detach(@Req() req: AuthedRequest, @Param('usageId') usageId: string) {
    return this.gallery.detachUsage(usageId, req.user);
  }

  @Delete(':id')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Delete unused gallery asset' })
  deleteAsset(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gallery.deleteDashboardGalleryAsset(id, req.user);
  }
}
