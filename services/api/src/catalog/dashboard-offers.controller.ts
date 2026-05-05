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
import { CreateOfferDto, PatchOfferDto } from './dto/offer.dto';
import { IsActiveBodyDto } from './dto/is-active-body.dto';

@ApiTags('dashboard-catalog-offers')
@Controller('dashboard/offers')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardOffersController {
  constructor(private readonly catalog: CatalogDashboardService) {}

  @Get()
  @RequirePermissions('offers.read')
  @ApiOperation({ summary: 'List offers' })
  list(@Query() query: DashboardCatalogListQueryDto) {
    return this.catalog.listOffers({
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    });
  }

  @Post()
  @RequirePermissions('offers.manage')
  @ApiOperation({ summary: 'Create offer' })
  create(@Body() dto: CreateOfferDto) {
    return this.catalog.createOffer(dto);
  }

  @Patch(':id/status')
  @RequirePermissions('offers.manage')
  @ApiOperation({ summary: 'Soft activate/deactivate offer' })
  patchStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IsActiveBodyDto,
  ) {
    return this.catalog.patchOfferStatus(id, dto.isActive);
  }

  @Patch(':id')
  @RequirePermissions('offers.manage')
  @ApiOperation({ summary: 'Update offer' })
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchOfferDto) {
    return this.catalog.patchOffer(id, dto);
  }
}
