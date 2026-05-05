import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { WhatsappDeepLinkDto } from './dto/whatsapp-deep-link.dto';
import { WhatsappDeepLinkService } from './whatsapp-deep-link.service';

@ApiTags('dashboard-whatsapp')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/whatsapp')
export class DashboardWhatsappDeepLinkController {
  constructor(private readonly deepLink: WhatsappDeepLinkService) {}

  @Post('deep-link')
  @RequirePermissions('whatsapp.send')
  @ApiOperation({
    summary: 'Build wa.me deep link with server-side template substitution',
  })
  generate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: WhatsappDeepLinkDto,
  ) {
    return this.deepLink.generate(user, {
      templateKey: body.templateKey,
      bookingId: body.bookingId,
      clientId: body.clientId,
    });
  }
}
