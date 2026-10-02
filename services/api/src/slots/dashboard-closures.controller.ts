import {
  Body,
  Controller,
  Delete,
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
import { ClosuresService } from './closures.service';
import { CreateClosureDto } from './dto/create-closure.dto';

@ApiTags('dashboard-closures')
@Controller('dashboard/branches/:branchId/closures')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardClosuresController {
  constructor(private readonly closures: ClosuresService) {}

  @Get()
  @RequirePermissions('slots.read')
  @ApiOperation({
    summary:
      'Holidays & closures for a branch, each with the appointments it affects',
  })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query('includePast') includePast?: string,
  ) {
    return this.closures.list(user, branchId, includePast === 'true');
  }

  @Post('preview')
  @RequirePermissions('slots.read')
  @ApiOperation({
    summary: 'What a closure would touch (open slots, booked appointments)',
  })
  preview(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateClosureDto,
  ) {
    return this.closures.preview(user, branchId, dto);
  }

  @Post()
  @RequirePermissions('slots.status.manage')
  @ApiOperation({
    summary: 'Close a branch for a date range (closes its slots)',
  })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateClosureDto,
  ) {
    return this.closures.create(user, branchId, dto);
  }

  @Delete(':closureId')
  @RequirePermissions('slots.status.manage')
  @ApiOperation({
    summary: 'Remove a closure: reopen its slots and refill the days',
  })
  remove(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
  ) {
    return this.closures.remove(user, branchId, closureId);
  }
}
