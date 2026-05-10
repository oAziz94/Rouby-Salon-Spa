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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CatalogDashboardService } from './catalog-dashboard.service';
import { DashboardCatalogListQueryDto } from './dto/dashboard-catalog-list-query.dto';
import {
  CreateServiceEnhancementDto,
  PatchServiceEnhancementDto,
} from './dto/service-enhancement.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-service-enhancements')
@Controller('dashboard/service-enhancements')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardServiceEnhancementsController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('service_enhancements.read')
  @ApiOperation({ summary: 'List service enhancements' })
  list(@Query() query: DashboardCatalogListQueryDto) {
    return this.catalog.listServiceEnhancements({
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('service_enhancements.manage')
  @ApiOperation({ summary: 'Create service enhancement' })
  create(@Body() dto: CreateServiceEnhancementDto) {
    return this.catalog.createServiceEnhancement(dto);
  }

  @Patch(':id')
  @RequirePermissions('service_enhancements.manage')
  @ApiOperation({ summary: 'Update service enhancement' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchServiceEnhancementDto,
  ) {
    return this.catalog.patchServiceEnhancement(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('service_enhancements.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate service enhancement' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchServiceEnhancementStatus(id, dto.isActive);
  }
}
