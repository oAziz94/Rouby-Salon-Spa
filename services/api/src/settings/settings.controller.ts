import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PatchSlotGenerationDto } from '../slots/dto/patch-slot-generation.dto';
import { PatchPaymentPolicyDto } from './dto/patch-payment-policy.dto';
import { PatchSystemSettingsDto } from './dto/patch-system-settings.dto';
import { PatchVatSettingsDto } from './dto/patch-vat-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('dashboard-settings')
@Controller('dashboard/settings')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('vat')
  @RequirePermissions('vat.settings.read')
  @ApiOperation({ summary: 'Get VAT settings + default timezone/currency' })
  getVat() {
    return this.settings.getVatResponse();
  }

  @Patch('vat')
  @RequirePermissions('vat.settings.manage')
  @ApiOperation({ summary: 'Update VAT settings (Sprint 9: audit log)' })
  patchVat(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: PatchVatSettingsDto,
  ) {
    return this.settings.patchVat(user, dto);
  }

  @Get('payment-policy')
  @RequirePermissions('payments.policy.read')
  @ApiOperation({
    summary: 'Get payment/deposit policy + default timezone/currency',
  })
  getPaymentPolicy() {
    return this.settings.getPaymentPolicyResponse();
  }

  @Patch('payment-policy')
  @RequirePermissions('payments.policy.manage')
  @ApiOperation({
    summary: 'Update payment/deposit policy (Sprint 9: audit log)',
  })
  patchPaymentPolicy(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: PatchPaymentPolicyDto,
  ) {
    return this.settings.patchPaymentPolicy(user, dto);
  }

  @Get('system')
  @RequirePermissions('settings.system.read')
  @ApiOperation({ summary: 'Read global system defaults (timezone, currency)' })
  getSystem() {
    return this.settings.getSystemReadResponse();
  }

  @Patch('system')
  @RequirePermissions('settings.system.manage')
  @ApiOperation({
    summary: 'Patch global system settings',
    description:
      'Sprint 2: no mutable fields; accepts empty body. Future: non-VAT global flags per API contract.',
  })
  patchSystem(@Body(new DefaultValuePipe({})) dto: PatchSystemSettingsDto) {
    void dto;
    return this.settings.patchSystemNoOp();
  }

  @Get('slot-generation')
  @RequirePermissions('slots.read')
  @ApiOperation({ summary: 'Get global slot generation defaults' })
  getSlotGeneration() {
    return this.settings.getSlotGenerationDefaultsResponse();
  }

  @Patch('slot-generation')
  @RequirePermissions('slots.create', 'slots.capacity.configure')
  @ApiOperation({ summary: 'Update global slot generation defaults' })
  patchSlotGeneration(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: PatchSlotGenerationDto,
  ) {
    return this.settings.patchSlotGenerationDefaults(user, dto);
  }
}
