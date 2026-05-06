import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientAuthService } from './client-auth.service';
import { CurrentClient } from './decorators/current-client.decorator';
import type { ClientJwtUser } from './client-jwt-user';
import { ClientJwtAuthGuard } from './guards/client-jwt-auth.guard';

@ApiTags('client-auth')
@ApiBearerAuth('client-jwt')
@UseGuards(ClientJwtAuthGuard)
@Controller('client')
export class ClientMeController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current client profile' })
  me(@CurrentClient() client: ClientJwtUser) {
    return this.clientAuth.getMe(client.clientId);
  }
}
