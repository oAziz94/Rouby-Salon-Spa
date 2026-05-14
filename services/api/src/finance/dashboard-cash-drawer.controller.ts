import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { CashDrawerService } from './cash-drawer.service';
import { CashDrawerCloseDto } from './dto/cash-drawer-close.dto';
import { CashDrawerCurrentQueryDto } from './dto/cash-drawer-current-query.dto';
import { CashDrawerMovementDto } from './dto/cash-drawer-movement.dto';
import { CashDrawerOpenDto } from './dto/cash-drawer-open.dto';
import { CashDrawerPatchDto } from './dto/cash-drawer-patch.dto';

@ApiTags('dashboard-cash-drawer')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/cash-drawer')
export class DashboardCashDrawerController {
  constructor(private readonly cashDrawer: CashDrawerService) {}

  @Get('current')
  @RequirePermissions('cashDrawer.read')
  @ApiOperation({ summary: 'Current cash drawer session and live totals' })
  current(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: CashDrawerCurrentQueryDto,
  ) {
    return this.cashDrawer.getCurrent(user, query.branchId, query.date);
  }

  @Post('open')
  @RequirePermissions('cashDrawer.open')
  @ApiOperation({ summary: 'Open cash drawer for branch and business date' })
  open(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: CashDrawerOpenDto,
  ) {
    return this.cashDrawer.open(user, body);
  }

  @Get(':id')
  @RequirePermissions('cashDrawer.read')
  @ApiOperation({ summary: 'Get cash drawer session detail' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.cashDrawer.getById(user, id);
  }

  @Patch(':id')
  @RequirePermissions('cashDrawer.update')
  @ApiOperation({ summary: 'Update counted cash / notes while drawer is open' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: CashDrawerPatchDto,
  ) {
    return this.cashDrawer.patch(user, id, body);
  }

  @Post(':id/movements')
  @RequirePermissions('cashDrawer.movement.create')
  @ApiOperation({ summary: 'Record a cash movement' })
  addMovement(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: CashDrawerMovementDto,
  ) {
    return this.cashDrawer.addMovement(user, id, body);
  }

  @Post(':id/close')
  @RequirePermissions('cashDrawer.close')
  @ApiOperation({ summary: 'Close cash drawer with counted cash' })
  close(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: CashDrawerCloseDto,
  ) {
    return this.cashDrawer.close(user, id, body);
  }
}
