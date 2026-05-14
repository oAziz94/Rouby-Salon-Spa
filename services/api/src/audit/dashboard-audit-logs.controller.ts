import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
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
  list(@Query() query: AuditLogListQueryDto) {
    return this.audit.list(query);
  }

  @Get('facets')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Audit log filter facets' })
  facets() {
    return this.audit.getFacets();
  }

  @Get(':id')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Get audit log detail by id' })
  async getById(@Param('id') id: string) {
    const row = await this.audit.getById(id);
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }
    return row;
  }
}
