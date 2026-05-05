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
import { CreateBundleDto, PatchBundleDto } from './dto/bundle.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-catalog-bundles')
@Controller('dashboard/bundles')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardBundlesController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('bundles.read')
  @ApiOperation({ summary: 'List bundles' })
  list(@Query() query: DashboardCatalogListQueryDto) {
    return this.catalog.listBundles({
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('bundles.manage')
  @ApiOperation({ summary: 'Create bundle' })
  create(@Body() dto: CreateBundleDto) {
    return this.catalog.createBundle(dto);
  }

  @Patch(':id/status')
  @RequirePermissions('bundles.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate bundle' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchBundleStatus(id, dto.isActive);
  }

  @Patch(':id')
  @RequirePermissions('bundles.manage')
  @ApiOperation({ summary: 'Update bundle' })
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchBundleDto) {
    return this.catalog.patchBundle(id, dto);
  }
}
