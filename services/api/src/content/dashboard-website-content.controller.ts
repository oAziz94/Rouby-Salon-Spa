import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardWebsiteContentListQueryDto } from './dto/dashboard-website-content-list-query.dto';
import { PatchWebsiteContentSectionDto } from './dto/patch-website-content-section.dto';
import { ReorderWebsiteContentDto } from './dto/reorder-website-content.dto';
import { WebsiteContentService } from './website-content.service';

type AuthedRequest = Request & { user: DashboardJwtUser };

@ApiTags('dashboard-website-content')
@Controller('dashboard/website-content')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardWebsiteContentController {
  constructor(private readonly websiteContent: WebsiteContentService) {}

  @Get()
  @RequirePermissions('websiteContent.read')
  @ApiOperation({ summary: 'List website content sections (grouped by page)' })
  list(@Query() query: DashboardWebsiteContentListQueryDto) {
    return this.websiteContent.listDashboard(query);
  }

  @Post('seed-defaults')
  @RequirePermissions('websiteContent.update')
  @ApiOperation({
    summary:
      'Idempotent upsert of default website sections (safe; does not overwrite existing row fields)',
  })
  seedDefaults(@Req() req: AuthedRequest) {
    return this.websiteContent.seedDefaultSections(req.user);
  }

  @Patch('reorder')
  @RequirePermissions('websiteContent.reorder')
  @ApiOperation({ summary: 'Update display order for website content sections' })
  reorder(@Req() req: AuthedRequest, @Body() dto: ReorderWebsiteContentDto) {
    return this.websiteContent.reorder(req.user, dto);
  }

  @Get(':id')
  @RequirePermissions('websiteContent.read')
  @ApiOperation({ summary: 'Get one website content section' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.websiteContent.getDashboardSection(id);
  }

  @Patch(':id')
  @RequirePermissions('websiteContent.update')
  @ApiOperation({ summary: 'Update website content section' })
  patch(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchWebsiteContentSectionDto,
  ) {
    return this.websiteContent.patchSection(req.user, id, dto);
  }
}
