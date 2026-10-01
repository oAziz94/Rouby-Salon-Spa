import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OverviewTodayQueryDto } from './dto/overview-today-query.dto';
import { OverviewTodayService } from './overview-today.service';

@ApiTags('dashboard-overview')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/overview')
export class DashboardOverviewTodayController {
  constructor(private readonly overviewToday: OverviewTodayService) {}

  @Get('today')
  @RequirePermissions('overview.read')
  @ApiOperation({
    summary: 'Light front-desk summary for today (queue counts, upcoming)',
  })
  today(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: OverviewTodayQueryDto,
  ) {
    return this.overviewToday.today(user, query.branchId);
  }
}
