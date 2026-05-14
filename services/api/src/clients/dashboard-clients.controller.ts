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
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateDashboardClientDto } from './dto/create-dashboard-client.dto';
import { DashboardClientListQueryDto } from './dto/dashboard-client-list-query.dto';
import { UpdateDashboardClientDto } from './dto/update-dashboard-client.dto';
import { DashboardClientsService } from './dashboard-clients.service';

@ApiTags('dashboard-clients')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/clients')
export class DashboardClientsController {
  constructor(private readonly clients: DashboardClientsService) {}

  @Get()
  @RequireAnyPermissions('clients.read', 'queue.manage')
  @ApiOperation({
    summary: 'List clients (RBAC + branch scoped)',
    description:
      'Also allowed with queue.manage so staff can search clients when checking walk-ins into the queue.',
  })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: DashboardClientListQueryDto,
  ) {
    return this.clients.listClients(user, query);
  }

  @Get(':clientId')
  @RequirePermissions('clients.read')
  @ApiOperation({ summary: 'Get client profile (RBAC masked)' })
  getById(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.clients.getClientById(user, clientId);
  }

  @Post()
  @RequirePermissions('clients.create')
  @ApiOperation({ summary: 'Create client profile' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: CreateDashboardClientDto,
  ) {
    return this.clients.createClient(user, dto);
  }

  @Patch(':clientId')
  @RequirePermissions('clients.update')
  @ApiOperation({ summary: 'Update client profile' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: UpdateDashboardClientDto,
  ) {
    return this.clients.patchClient(user, clientId, dto);
  }
}
