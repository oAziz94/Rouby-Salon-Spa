import {
  Body,
  Controller,
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
import { CreateDashboardUserDto } from './dto/create-dashboard-user.dto';
import { DashboardUserListQueryDto } from './dto/dashboard-user-list-query.dto';
import { OwnerSetUserPasswordDto } from './dto/owner-set-user-password.dto';
import { UpdateDashboardUserDto } from './dto/update-dashboard-user.dto';
import { DashboardUsersService } from './dashboard-users.service';

@ApiTags('dashboard-users')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardUsersController {
  constructor(private readonly usersService: DashboardUsersService) {}

  @Get('users')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List dashboard users' })
  listUsers(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: DashboardUserListQueryDto,
  ) {
    return this.usersService.listUsers(user, query);
  }

  @Get('users/:userId')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get dashboard user details' })
  getUser(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.usersService.getUser(user, userId);
  }

  @Post('users')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Create dashboard user (existing roles only)' })
  createUser(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: CreateDashboardUserDto,
  ) {
    return this.usersService.createUser(user, dto);
  }

  @Patch('users/:userId')
  @RequirePermissions('users.manage')
  @ApiOperation({
    summary: 'Update dashboard user profile / role / branch access',
  })
  updateUser(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateDashboardUserDto,
  ) {
    return this.usersService.updateUser(user, userId, dto);
  }

  @Post('users/:userId/password')
  @RequirePermissions('users.manage')
  @ApiOperation({
    summary:
      'Owner or Admin: set a user’s login password (does not require their old password)',
  })
  ownerSetUserPassword(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: OwnerSetUserPasswordDto,
  ) {
    return this.usersService.ownerSetUserPassword(user, userId, dto);
  }

  @Post('users/:userId/activate')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Activate dashboard user' })
  activateUser(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.usersService.activateUser(user, userId);
  }

  @Post('users/:userId/deactivate')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Deactivate dashboard user (soft lockout only)' })
  deactivateUser(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.usersService.deactivateUser(user, userId);
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'List existing system roles' })
  listRoles(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.usersService.listRoles(user);
  }

  @Get('rbac-matrix')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Read-only RBAC matrix for existing roles' })
  getRbacMatrix(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.usersService.getRbacMatrix(user);
  }
}
