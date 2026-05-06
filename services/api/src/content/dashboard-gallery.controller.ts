import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContentService } from './content.service';
import { DashboardGalleryListQueryDto } from './dto/dashboard-gallery-list-query.dto';
import {
  CreateGalleryItemDto,
  PatchGalleryItemDto,
  PatchGalleryStatusDto,
} from './dto/gallery.dto';

@ApiTags('dashboard-content-gallery')
@Controller('dashboard/gallery')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardGalleryController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequirePermissions('gallery.read')
  @ApiOperation({ summary: 'List gallery items for dashboard' })
  list(@Query() query: DashboardGalleryListQueryDto) {
    return this.content.listDashboardGallery(query);
  }

  @Post()
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Create gallery item' })
  create(@Body() dto: CreateGalleryItemDto) {
    return this.content.createGalleryItem(dto);
  }

  @Patch(':id')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Update gallery item' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchGalleryItemDto,
  ) {
    return this.content.patchGalleryItem(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('gallery.manage')
  @ApiOperation({ summary: 'Activate/deactivate gallery item' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchGalleryStatusDto,
  ) {
    return this.content.patchGalleryStatus(id, dto);
  }
}
