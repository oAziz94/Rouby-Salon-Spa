import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardNotificationsService } from './dashboard-notifications.service';
import { NotificationLogListQueryDto } from './dto/notification-log-list-query.dto';

@ApiTags('dashboard-notifications')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/notifications')
export class DashboardNotificationsController {
  constructor(
    private readonly dashboardNotifications: DashboardNotificationsService,
  ) {}

  @Get()
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'List WhatsApp notification logs' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: NotificationLogListQueryDto,
  ) {
    return this.dashboardNotifications.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('notifications.read')
  @ApiOperation({ summary: 'Get notification log detail' })
  getById(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dashboardNotifications.getById(user, id);
  }

  @Post(':id/retry')
  @RequirePermissions('notifications.retry')
  @ApiOperation({ summary: 'Retry a failed WhatsApp notification' })
  retry(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dashboardNotifications.retry(user, id);
  }
}
