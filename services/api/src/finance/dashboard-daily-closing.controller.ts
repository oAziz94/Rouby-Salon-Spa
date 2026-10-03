import {
  Body,
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
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DailyClosingService } from './daily-closing.service';
import { DailyClosingCloseDto } from './dto/daily-closing-close.dto';
import { DailyClosingDraftDto } from './dto/daily-closing-draft.dto';
import { DailyClosingSummaryQueryDto } from './dto/daily-closing-summary-query.dto';

@ApiTags('dashboard-daily-closing')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/daily-closing')
export class DashboardDailyClosingController {
  constructor(private readonly dailyClosing: DailyClosingService) {}

  @Get('summary')
  @RequirePermissions('dailyClosing.read')
  @ApiOperation({ summary: 'Live daily closing summary for branch and date' })
  summary(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: DailyClosingSummaryQueryDto,
  ) {
    return this.dailyClosing.getSummary(user, query.branchId, query.date);
  }

  @Post()
  @RequirePermissions('dailyClosing.create')
  @ApiOperation({ summary: 'Create or update draft daily closing' })
  saveDraft(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: DailyClosingDraftDto,
  ) {
    return this.dailyClosing.saveDraft(user, body);
  }

  @Get(':id')
  @RequirePermissions('dailyClosing.read')
  @ApiOperation({ summary: 'Get daily closing report by id' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dailyClosing.getById(user, id);
  }

  @Post(':id/close')
  @RequirePermissions('dailyClosing.close')
  @ApiOperation({ summary: 'Close business day (final snapshot)' })
  close(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DailyClosingCloseDto,
  ) {
    return this.dailyClosing.close(user, id, body);
  }
}
