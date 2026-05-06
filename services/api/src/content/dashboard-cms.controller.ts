import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContentService } from './content.service';
import { PatchSiteContentDto } from './dto/site-content.dto';

@ApiTags('dashboard-content-cms')
@Controller('dashboard/cms')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardCmsController {
  constructor(private readonly content: ContentService) {}

  @Get('site')
  @RequirePermissions('content.read')
  @ApiOperation({ summary: 'Get dashboard site content singleton' })
  getSite() {
    return this.content.getDashboardSiteContent();
  }

  @Patch('site')
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Patch dashboard site content singleton' })
  patchSite(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: PatchSiteContentDto,
  ) {
    return this.content.patchDashboardSiteContent(user, dto);
  }
}
