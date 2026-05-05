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
import { DashboardServicesListQueryDto } from './dto/dashboard-catalog-list-query.dto';
import { CreateServiceDto, PatchServiceDto } from './dto/service.dto';
import { CreateServiceVariantDto } from './dto/service.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-catalog-services')
@Controller('dashboard/services')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardServicesController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('services.read')
  @ApiOperation({ summary: 'List services' })
  list(@Query() query: DashboardServicesListQueryDto) {
    return this.catalog.listServices({
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('services.manage')
  @ApiOperation({ summary: 'Create service' })
  create(@Body() dto: CreateServiceDto) {
    return this.catalog.createService(dto);
  }

  @Get(':serviceId/variants')
  @RequirePermissions('service_variants.read')
  @ApiOperation({ summary: 'List variants for a service' })
  listVariants(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.catalog.listVariants(serviceId);
  }

  @Post(':serviceId/variants')
  @RequirePermissions('service_variants.manage')
  @ApiOperation({ summary: 'Create service variant' })
  createVariant(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: CreateServiceVariantDto,
  ) {
    return this.catalog.createVariant(serviceId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('services.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate service' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchServiceStatus(id, dto.isActive);
  }

  @Patch(':id')
  @RequirePermissions('services.manage')
  @ApiOperation({ summary: 'Update service' })
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchServiceDto) {
    return this.catalog.patchService(id, dto);
  }
}
