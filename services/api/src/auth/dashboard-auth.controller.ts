import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentDashboardUser } from './decorators/current-dashboard-user.decorator';
import type { DashboardJwtUser } from './dashboard-jwt-user';
import { DashboardAuthService } from './dashboard-auth.service';
import { ChangeDashboardPasswordDto } from './dto/change-dashboard-password.dto';
import { DashboardLoginDto } from './dto/dashboard-login.dto';
import { UpdateDashboardProfileDto } from './dto/update-dashboard-profile.dto';
import { DashboardJwtAuthGuard } from './guards/dashboard-jwt-auth.guard';

@ApiTags('dashboard-auth')
@Controller('dashboard/auth')
export class DashboardAuthController {
  constructor(private readonly dashboardAuth: DashboardAuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dashboard email + password login' })
  @ApiResponse({
    status: 200,
    description: 'Returns access JWT (aud=dashboard)',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  login(@Body() dto: DashboardLoginDto) {
    return this.dashboardAuth.login(dto);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({
    summary: 'Dashboard logout',
    description:
      'Sprint 1: no server-side session. Client discards the access token after this succeeds.',
  })
  logout(): void {
    return undefined;
  }

  @Get('me')
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({ summary: 'Current dashboard user' })
  me(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.dashboardAuth.getMe(user.userId);
  }

  @Patch('me')
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({ summary: 'Update current user name / phone' })
  patchMe(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: UpdateDashboardProfileDto,
  ) {
    return this.dashboardAuth.updateMyProfile(user.userId, dto);
  }

  @Post('me/password')
  @HttpCode(200)
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({
    summary: 'Change current user password (requires current password)',
  })
  changeMyPassword(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: ChangeDashboardPasswordDto,
  ) {
    return this.dashboardAuth.changeMyPassword(user.userId, dto);
  }

  @Get('permissions')
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({ summary: 'Effective permission keys for UI gating' })
  permissions(@CurrentDashboardUser() user: DashboardJwtUser) {
    return this.dashboardAuth.getPermissions(user.userId);
  }
}
