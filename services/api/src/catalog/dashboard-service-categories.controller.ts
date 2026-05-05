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
import {
  CreateServiceCategoryDto,
  PatchServiceCategoryDto,
} from './dto/service-category.dto';
import { DashboardCatalogListQueryDto } from './dto/dashboard-catalog-list-query.dto';

@ApiTags('dashboard-catalog-categories')
@Controller('dashboard/service-categories')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardServiceCategoriesController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('services.read')
  @ApiOperation({ summary: 'List service categories' })
  list(@Query() query: DashboardCatalogListQueryDto) {
    return this.catalog.listCategories({
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('services.categories.manage')
  @ApiOperation({ summary: 'Create service category' })
  create(@Body() dto: CreateServiceCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Patch(':id')
  @RequirePermissions('services.categories.manage')
  @ApiOperation({ summary: 'Update service category (incl. isActive)' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchServiceCategoryDto,
  ) {
    return this.catalog.patchCategory(id, dto);
  }
}
