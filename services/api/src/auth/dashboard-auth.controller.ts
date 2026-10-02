import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
import {
  DashboardLogoutDto,
  DashboardRefreshDto,
} from './dto/dashboard-refresh.dto';
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
  login(@Body() dto: DashboardLoginDto, @Req() req: Request, @Ip() ip: string) {
    return this.dashboardAuth.login(dto, {
      userAgent: req.get('user-agent'),
      ipAddress: ip,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Exchange a refresh token for a new access token (rotates the refresh token)',
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired' })
  refresh(
    @Body() dto: DashboardRefreshDto,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    return this.dashboardAuth.refresh(dto.refreshToken, {
      userAgent: req.get('user-agent'),
      ipAddress: ip,
    });
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(DashboardJwtAuthGuard)
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({
    summary: 'Dashboard logout',
    description:
      'Revokes the refresh-token family of this session. The client discards both tokens.',
  })
  async logout(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: DashboardLogoutDto,
  ): Promise<void> {
    await this.dashboardAuth.logout(user.userId, dto?.refreshToken ?? null);
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
