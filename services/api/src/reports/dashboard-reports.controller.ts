import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ReportsService } from './reports.service';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';

@ApiTags('dashboard-reports')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/reports')
export class DashboardReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Overview report' })
  overview(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.overview(user, query);
  }

  @Get('operations')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Operations report' })
  operations(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.operations(user, query);
  }

  @Get('financial')
  @RequirePermissions('reports.view_financial')
  @ApiOperation({ summary: 'Financial report' })
  financial(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.financial(user, query);
  }

  @Get('bookings')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Bookings report' })
  bookings(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.bookings(user, query);
  }

  @Get('services')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Services report' })
  services(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.services(user, query);
  }

  @Get('clients')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Clients report' })
  clients(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.clients(user, query);
  }

  @Get('payments')
  @RequirePermissions('reports.view_financial')
  @ApiOperation({ summary: 'Payments report' })
  payments(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.payments(user, query);
  }

  @Get('financial-summary')
  @RequirePermissions('reports.view_financial')
  @ApiOperation({ summary: 'Financial manager consolidated report' })
  financialSummary(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.financialSummary(user, query);
  }

  @Get('financial/export')
  @RequirePermissions('reports.view_financial')
  @ApiOperation({ summary: 'Export financial report CSV' })
  async exportFinancialSummary(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query()
    query: ReportRangeQueryDto & {
      type?:
        | 'summary'
        | 'payments'
        | 'outstanding'
        | 'sales-items'
        | 'daily-closing';
    },
    @Res() res: Response,
  ) {
    const exported = await this.reports.exportFinancialSummary(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.filename}"`,
    );
    res.send(exported.csv);
  }
}
