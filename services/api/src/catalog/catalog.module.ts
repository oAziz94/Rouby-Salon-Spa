import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogDashboardService } from './catalog-dashboard.service';
import { CatalogPickerService } from './catalog-picker.service';
import { CatalogPublicService } from './catalog-public.service';
import { DashboardCatalogPickerController } from './dashboard-catalog-picker.controller';
import { DashboardBundlesController } from './dashboard-bundles.controller';
import { DashboardOffersController } from './dashboard-offers.controller';
import { DashboardPackagesController } from './dashboard-packages.controller';
import { DashboardServiceCategoriesController } from './dashboard-service-categories.controller';
import { DashboardServiceEnhancementsController } from './dashboard-service-enhancements.controller';
import { DashboardServicesController } from './dashboard-services.controller';
import { DashboardServiceVariantsController } from './dashboard-service-variants.controller';
import { PublicCatalogController } from './public-catalog.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    DashboardServiceCategoriesController,
    DashboardServiceEnhancementsController,
    DashboardServicesController,
    DashboardServiceVariantsController,
    DashboardPackagesController,
    DashboardBundlesController,
    DashboardOffersController,
    PublicCatalogController,
    DashboardCatalogPickerController,
  ],
  providers: [
    CatalogDashboardService,
    CatalogPublicService,
    CatalogPickerService,
  ],
})
export class CatalogModule {}
