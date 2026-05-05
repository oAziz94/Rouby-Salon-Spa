import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CatalogDashboardService } from './catalog-dashboard.service';
import { PatchServiceVariantDto } from './dto/service.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-catalog-service-variants')
@Controller('dashboard/service-variants')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardServiceVariantsController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Patch(':id/status')
  @RequirePermissions('service_variants.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate variant' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchVariantStatus(id, dto.isActive);
  }

  @Patch(':id')
  @RequirePermissions('service_variants.manage')
  @ApiOperation({ summary: 'Update service variant' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchServiceVariantDto,
  ) {
    return this.catalog.patchVariant(id, dto);
  }
}
