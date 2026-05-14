import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchSettingsDto } from './dto/update-branch-settings.dto';
import { PatchBranchSlotSettingsDto } from './dto/patch-branch-slot-settings.dto';

@ApiTags('dashboard-branches')
@Controller('dashboard/branches')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions('branches.read')
  @ApiOperation({ summary: 'List branches (scoped when user.branchId is set)' })
  list(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.branches.list(user);
  }

  @Get(':branchId')
  @RequirePermissions('branches.read')
  @ApiOperation({ summary: 'Get branch by id' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.branches.getById(user, branchId);
  }

  @Post()
  @RequirePermissions('branches.create')
  @ApiOperation({ summary: 'Create branch (Owner)' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branches.create(user, dto);
  }

  @Patch(':branchId/settings')
  @RequirePermissions('settings.branch.manage')
  @ApiOperation({
    summary: 'Update branch operational fields (phone, WhatsApp, map, hours)',
  })
  patchSettings(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchSettingsDto,
  ) {
    return this.branches.updateOperationalSettings(user, branchId, dto);
  }

  @Patch(':branchId')
  @RequirePermissions('branches.update')
  @ApiOperation({ summary: 'Update branch (Owner)' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(user, branchId, dto);
  }

  @Get(':branchId/slot-settings')
  @RequirePermissions('slots.read')
  @ApiOperation({ summary: 'Get branch slot generation defaults' })
  getSlotSettings(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.branches.getSlotSettings(user, branchId);
  }

  @Patch(':branchId/slot-settings')
  @RequirePermissions('slots.create', 'slots.capacity.configure')
  @ApiOperation({ summary: 'Update branch slot generation defaults' })
  patchSlotSettings(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: PatchBranchSlotSettingsDto,
  ) {
    return this.branches.updateSlotSettings(user, branchId, dto);
  }
}
