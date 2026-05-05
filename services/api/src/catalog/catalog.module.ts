import { Module } from '@nestjs/common';
import { CatalogDashboardService } from './catalog-dashboard.service';
import { CatalogPublicService } from './catalog-public.service';
import { DashboardBundlesController } from './dashboard-bundles.controller';
import { DashboardOffersController } from './dashboard-offers.controller';
import { DashboardPackagesController } from './dashboard-packages.controller';
import { DashboardServiceCategoriesController } from './dashboard-service-categories.controller';
import { DashboardServicesController } from './dashboard-services.controller';
import { DashboardServiceVariantsController } from './dashboard-service-variants.controller';
import { PublicCatalogController } from './public-catalog.controller';

@Module({
  controllers: [
    DashboardServiceCategoriesController,
    DashboardServicesController,
    DashboardServiceVariantsController,
    DashboardPackagesController,
    DashboardBundlesController,
    DashboardOffersController,
    PublicCatalogController,
  ],
  providers: [CatalogDashboardService, CatalogPublicService],
})
export class CatalogModule {}
