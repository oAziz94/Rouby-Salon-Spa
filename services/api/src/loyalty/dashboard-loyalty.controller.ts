import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import {
  AdjustLoyaltyPointsDto,
  PatchLoyaltySettingsDto,
  RedeemLoyaltyPointsDto,
} from './dto/loyalty.dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('dashboard-loyalty')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('loyalty/settings')
  @RequirePermissions('loyalty.read')
  @ApiOperation({ summary: 'Loyalty program rules' })
  settings() {
    return this.loyalty.getRules();
  }

  @Patch('loyalty/settings')
  @RequirePermissions('loyalty.manage')
  @ApiOperation({
    summary: 'Change loyalty rules / switch the program on or off',
  })
  patchSettings(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: PatchLoyaltySettingsDto,
  ) {
    return this.loyalty.patchRules(user, dto);
  }

  @Get('loyalty/clients')
  @RequirePermissions('loyalty.read')
  @ApiOperation({
    summary: 'Clients with loyalty activity, best balance first',
  })
  clients() {
    return this.loyalty.listClients();
  }

  @Get('loyalty/clients/:clientId')
  @RequirePermissions('loyalty.read')
  @ApiOperation({ summary: 'Points, visits and reward state for one client' })
  client(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.loyalty.clientSummary(user, clientId);
  }

  @Post('loyalty/clients/:clientId/adjust')
  @HttpCode(200)
  @RequirePermissions('loyalty.manage')
  @ApiOperation({ summary: 'Manually add or remove points (audited)' })
  adjust(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body() dto: AdjustLoyaltyPointsDto,
  ) {
    return this.loyalty.adjust(user, clientId, dto.points, dto.note);
  }

  @Get('queue/:queueEntryId/loyalty')
  @RequirePermissions('loyalty.read')
  @ApiOperation({ summary: 'Loyalty state for the client of a queue visit' })
  forVisit(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId', new ParseUUIDPipe()) queueEntryId: string,
  ) {
    return this.loyalty.summaryForQueueEntry(user, queueEntryId);
  }

  @Post('queue/:queueEntryId/loyalty/redeem-points')
  @HttpCode(200)
  @RequirePermissions('loyalty.redeem')
  @ApiOperation({
    summary: 'Pay part of the finalized invoice with loyalty points',
  })
  redeemPoints(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId', new ParseUUIDPipe()) queueEntryId: string,
    @Body() dto: RedeemLoyaltyPointsDto,
  ) {
    return this.loyalty.redeemPoints(user, queueEntryId, dto.blocks);
  }

  @Post('queue/:queueEntryId/loyalty/redeem-reward')
  @HttpCode(200)
  @RequirePermissions('loyalty.redeem')
  @ApiOperation({
    summary: 'Use the free-service visit reward on this invoice',
  })
  redeemReward(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('queueEntryId', new ParseUUIDPipe()) queueEntryId: string,
  ) {
    return this.loyalty.redeemReward(user, queueEntryId);
  }
}
