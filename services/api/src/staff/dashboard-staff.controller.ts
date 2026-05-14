import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { StaffService } from './staff.service';
import { CreateStaffProfileDto } from './dto/create-staff-profile.dto';
import { PatchStaffProfileDto } from './dto/patch-staff-profile.dto';
import { PutStaffServicesDto } from './dto/put-staff-services.dto';
import { PutStaffScheduleDto } from './dto/put-staff-schedule.dto';
import { CreateStaffExceptionDto } from './dto/create-staff-exception.dto';
import { PatchStaffExceptionDto } from './dto/patch-staff-exception.dto';
import { StaffAvailabilityQueryDto } from './dto/staff-availability-query.dto';

@ApiTags('dashboard-staff')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/staff')
export class DashboardStaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('availability')
  @RequirePermissions('staff.read')
  @ApiOperation({ summary: 'Qualified staff availability for a service at a branch/time' })
  availability(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: StaffAvailabilityQueryDto,
  ) {
    return this.staff.availabilityQuery(user, {
      branchId: query.branchId,
      serviceId: query.serviceId,
      date: query.date,
      startTime: query.startTime,
      endTime: query.endTime,
    });
  }

  @Get()
  @RequirePermissions('staff.read')
  @ApiOperation({ summary: 'List staff users and profiles for a branch' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query('branchId') branchId: string,
  ) {
    return this.staff.listStaff(user, branchId);
  }

  @Post()
  @RequirePermissions('staff.create')
  @ApiOperation({ summary: 'Create staff profile for a Staff-role user' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: CreateStaffProfileDto,
  ) {
    return this.staff.createProfile(user, body);
  }

  @Get(':id')
  @RequirePermissions('staff.read')
  @ApiOperation({ summary: 'Get staff profile detail' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.staff.getProfile(user, id);
  }

  @Patch(':id')
  @RequirePermissions('staff.update')
  @ApiOperation({ summary: 'Update staff profile' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: PatchStaffProfileDto,
  ) {
    return this.staff.patchProfile(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions('staff.delete')
  @ApiOperation({ summary: 'Soft-deactivate staff profile' })
  remove(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.staff.deactivateProfile(user, id);
  }

  @Get(':id/services')
  @RequirePermissions('staffServices.read')
  getServices(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.staff.getServices(user, id);
  }

  @Put(':id/services')
  @RequirePermissions('staffServices.update')
  putServices(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: PutStaffServicesDto,
  ) {
    return this.staff.putServices(user, id, body);
  }

  @Get(':id/schedule')
  @RequirePermissions('staffSchedule.read')
  getSchedule(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.staff.getSchedule(user, id);
  }

  @Put(':id/schedule')
  @RequirePermissions('staffSchedule.update')
  putSchedule(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: PutStaffScheduleDto,
  ) {
    return this.staff.putSchedule(user, id, body);
  }

  @Get(':id/exceptions')
  @RequirePermissions('staffSchedule.read')
  listExceptions(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
  ) {
    return this.staff.listExceptions(user, id);
  }

  @Post(':id/exceptions')
  @RequirePermissions('staffSchedule.create')
  createException(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Body() body: CreateStaffExceptionDto,
  ) {
    return this.staff.createException(user, id, body);
  }

  @Patch(':id/exceptions/:exceptionId')
  @RequirePermissions('staffSchedule.update')
  patchException(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Param('exceptionId') exceptionId: string,
    @Body() body: PatchStaffExceptionDto,
  ) {
    return this.staff.patchException(user, id, exceptionId, body);
  }

  @Delete(':id/exceptions/:exceptionId')
  @RequirePermissions('staffSchedule.delete')
  deleteException(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id') id: string,
    @Param('exceptionId') exceptionId: string,
  ) {
    return this.staff.deleteException(user, id, exceptionId);
  }
}
