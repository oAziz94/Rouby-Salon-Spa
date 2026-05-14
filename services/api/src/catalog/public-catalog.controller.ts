import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogPublicService } from './catalog-public.service';
import { PublicCatalogListQueryDto } from './dto/public-catalog-list-query.dto';

@ApiTags('public-catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogPublicService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List active service categories' })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('services')
  @ApiOperation({ summary: 'List active services (optional branch filter)' })
  listServices(@Query() query: PublicCatalogListQueryDto) {
    return this.catalog.listServices({
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      branchId: query.branchId,
      isFeatured: query.isFeatured,
    });
  }

  @Get('services/:serviceId/variants')
  @ApiOperation({ summary: 'Active variants for a public service' })
  listVariants(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.catalog.listVariants(serviceId);
  }

  @Get('services/:serviceId')
  @ApiOperation({ summary: 'Service detail (optional ?branchId=)' })
  getService(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.catalog.getService(serviceId, branchId);
  }

  @Get('packages')
  @ApiOperation({ summary: 'List active packages in date window' })
  listPackages(@Query() query: PublicCatalogListQueryDto) {
    return this.catalog.listPackages({
      page: query.page,
      pageSize: query.pageSize,
      branchId: query.branchId,
    });
  }

  @Get('packages/:packageId')
  @ApiOperation({ summary: 'Package detail (optional ?branchId=)' })
  getPackage(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.catalog.getPackage(packageId, branchId);
  }

  @Get('bundles')
  @ApiOperation({ summary: 'List active bundles in date window' })
  listBundles(@Query() query: PublicCatalogListQueryDto) {
    return this.catalog.listBundles({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('bundles/:bundleId')
  @ApiOperation({ summary: 'Bundle detail' })
  getBundle(@Param('bundleId', ParseUUIDPipe) bundleId: string) {
    return this.catalog.getBundle(bundleId);
  }

  @Get('offers')
  @ApiOperation({ summary: 'List active offers in date window' })
  listOffers(@Query() query: PublicCatalogListQueryDto) {
    return this.catalog.listOffers({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('service-enhancements')
  @ApiOperation({
    summary: 'List active service enhancements for public website',
  })
  listServiceEnhancements() {
    return this.catalog.listServiceEnhancements();
  }
}
