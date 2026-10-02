import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CatalogPickerService } from './catalog-picker.service';
import {
  CatalogSearchTermsParamsDto,
  PatchCatalogSearchTermsDto,
  PickerCatalogQueryDto,
} from './dto/catalog-search-terms.dto';

@ApiTags('dashboard-catalog-picker')
@Controller('dashboard/catalog')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardCatalogPickerController {
  constructor(private readonly picker: CatalogPickerService) {}

  @Get('picker')
  @RequirePermissions('services.read')
  @ApiOperation({
    summary:
      'Compact bookable catalog for the front-desk picker: services, variants, categories, packages, add-ons',
  })
  picker_(@Query() query: PickerCatalogQueryDto) {
    return this.picker.getPickerCatalog(query.branchId);
  }

  @Patch('search-terms/:kind/:id')
  @RequirePermissions('services.manage')
  @ApiOperation({
    summary: 'Set Arabic name and search aliases on a catalog item',
  })
  patchSearchTerms(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param() params: CatalogSearchTermsParamsDto,
    @Body() body: PatchCatalogSearchTermsDto,
  ) {
    return this.picker.patchSearchTerms(user, params.kind, params.id, body);
  }
}
