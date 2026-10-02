import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditService } from './audit.service';
import { AuditLogListQueryDto } from './dto/audit-log-list-query.dto';

@ApiTags('dashboard-audit-logs')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/audit-logs')
export class DashboardAuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List audit logs' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: AuditLogListQueryDto,
  ) {
    return this.audit.list(query, user);
  }

  @Get('facets')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Audit log filter facets' })
  facets(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.audit.getFacets(user);
  }

  @Get(':id')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Get audit log detail by id' })
  async getById(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    const row = await this.audit.getById(id, user);
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }
    return row;
  }
}
