import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from './guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * Sprint 1 smoke: Owner-only `roles.read` proves permission guard fail-closed.
 * Remove or narrow when real dashboard routes exist.
 */
@ApiTags('dashboard-internal')
@Controller('dashboard/_internal')
export class DashboardInternalController {
  @Get('auth-probe')
  @UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('roles.read')
  @ApiBearerAuth('dashboard-jwt')
  @ApiOperation({ summary: 'RBAC probe (requires roles.read)' })
  authProbe(): { ok: true } {
    return { ok: true };
  }
}
