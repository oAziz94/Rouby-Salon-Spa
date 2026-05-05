import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateSlotDto } from './dto/create-slot.dto';
import { DashboardSlotListQueryDto } from './dto/dashboard-slot-list-query.dto';
import { PatchSlotCapacityDto } from './dto/patch-slot-capacity.dto';
import { PatchSlotOnlineBookableDto } from './dto/patch-slot-online-bookable.dto';
import { PatchSlotStatusDto } from './dto/patch-slot-status.dto';
import { PatchSlotDto } from './dto/patch-slot.dto';
import { SlotsService } from './slots.service';

@ApiTags('dashboard-booking-slots')
@Controller('dashboard/branches/:branchId/slots')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @RequirePermissions('slots.read')
  @ApiOperation({ summary: 'List booking slots by branch' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: DashboardSlotListQueryDto,
  ) {
    return this.slots.listDashboardSlots(user, branchId, query);
  }

  @Get(':slotId')
  @RequirePermissions('slots.read')
  @ApiOperation({ summary: 'Get booking slot by id' })
  getById(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    return this.slots.getDashboardSlot(user, branchId, slotId);
  }

  @Post()
  @RequirePermissions('slots.create')
  @ApiOperation({ summary: 'Create booking slot' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateSlotDto,
  ) {
    return this.slots.createDashboardSlot(user, branchId, dto);
  }

  @Patch(':slotId')
  @RequirePermissions('slots.update')
  @ApiOperation({ summary: 'Patch booking slot' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: PatchSlotDto,
  ) {
    return this.slots.patchDashboardSlot(user, branchId, slotId, dto);
  }

  @Patch(':slotId/capacity')
  @RequirePermissions('slots.capacity.configure')
  @ApiOperation({ summary: 'Patch booking slot capacity' })
  patchCapacity(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: PatchSlotCapacityDto,
  ) {
    return this.slots.patchDashboardSlotCapacity(user, branchId, slotId, dto);
  }

  @Patch(':slotId/online-bookable')
  @RequirePermissions('slots.update')
  @ApiOperation({ summary: 'Patch booking slot online bookable' })
  patchOnlineBookable(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: PatchSlotOnlineBookableDto,
  ) {
    return this.slots.patchDashboardSlotOnlineBookable(
      user,
      branchId,
      slotId,
      dto,
    );
  }

  @Patch(':slotId/status')
  @RequirePermissions('slots.status.manage')
  @ApiOperation({ summary: 'Patch booking slot status' })
  patchStatus(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: PatchSlotStatusDto,
  ) {
    return this.slots.patchDashboardSlotStatus(user, branchId, slotId, dto);
  }

  @Delete(':slotId')
  @RequirePermissions('slots.delete')
  @ApiOperation({ summary: 'Soft delete booking slot' })
  softDelete(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    return this.slots.softDeleteDashboardSlot(user, branchId, slotId);
  }
}
