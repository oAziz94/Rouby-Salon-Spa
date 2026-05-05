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
import { CreatePackageDto, PatchPackageDto } from './dto/package.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-catalog-packages')
@Controller('dashboard/packages')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardPackagesController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('packages.read')
  @ApiOperation({ summary: 'List packages' })
  list(@Query() query: DashboardCatalogListQueryDto) {
    return this.catalog.listPackages({
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('packages.manage')
  @ApiOperation({ summary: 'Create package' })
  create(@Body() dto: CreatePackageDto) {
    return this.catalog.createPackage(dto);
  }

  @Patch(':id/status')
  @RequirePermissions('packages.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate package' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchPackageStatus(id, dto.isActive);
  }

  @Patch(':id')
  @RequirePermissions('packages.manage')
  @ApiOperation({ summary: 'Update package' })
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchPackageDto) {
    return this.catalog.patchPackage(id, dto);
  }
}
