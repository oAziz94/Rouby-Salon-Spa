-- CreateEnum
CREATE TYPE "PriceDisplayType" AS ENUM ('FIXED', 'STARTS_FROM', 'RANGE', 'CONTACT', 'HIDDEN');

-- CreateEnum
CREATE TYPE "BundleType" AS ENUM ('FIXED', 'FLEXIBLE', 'QUANTITY', 'MEMBERSHIP_STYLE');

-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'SERVICE', 'PACKAGE', 'BUNDLE', 'FIRST_BOOKING', 'SEASONAL', 'PROMO_CODE');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "price_display_type" "PriceDisplayType" NOT NULL,
    "base_price" DECIMAL(12,2),
    "base_price_max" DECIMAL(12,2),
    "duration_minutes" INTEGER,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "booking_availability" BOOLEAN NOT NULL DEFAULT true,
    "preparation_notes" TEXT,
    "aftercare_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_branches" (
    "service_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "service_branches_pkey" PRIMARY KEY ("service_id","branch_id")
);

-- CreateTable
CREATE TABLE "service_variants" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "original_price" DECIMAL(12,2) NOT NULL,
    "package_price" DECIMAL(12,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_services" (
    "package_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_services_pkey" PRIMARY KEY ("package_id","service_id")
);

-- CreateTable
CREATE TABLE "package_branches" (
    "package_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "package_branches_pkey" PRIMARY KEY ("package_id","branch_id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bundle_type" "BundleType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "rules" JSONB,
    "selectable_count" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_services" (
    "bundle_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bundle_services_pkey" PRIMARY KEY ("bundle_id","service_id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "offer_code" TEXT,
    "discount_type" "OfferDiscountType" NOT NULL,
    "discount_value" DECIMAL(12,4) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "usage_limit" INTEGER,
    "per_client_usage_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "eligibility_rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "services_category_id_is_active_idx" ON "services"("category_id", "is_active");

-- CreateIndex
CREATE INDEX "service_branches_branch_id_idx" ON "service_branches"("branch_id");

-- CreateIndex
CREATE INDEX "service_variants_service_id_is_active_idx" ON "service_variants"("service_id", "is_active");

-- CreateIndex
CREATE INDEX "packages_is_active_idx" ON "packages"("is_active");

-- CreateIndex
CREATE INDEX "package_services_service_id_idx" ON "package_services"("service_id");

-- CreateIndex
CREATE INDEX "package_branches_branch_id_idx" ON "package_branches"("branch_id");

-- CreateIndex
CREATE INDEX "bundles_is_active_idx" ON "bundles"("is_active");

-- CreateIndex
CREATE INDEX "bundle_services_service_id_idx" ON "bundle_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_offer_code_key" ON "offers"("offer_code");

-- CreateIndex
CREATE INDEX "offers_is_active_idx" ON "offers"("is_active");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_branches" ADD CONSTRAINT "service_branches_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_branches" ADD CONSTRAINT "service_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_branches" ADD CONSTRAINT "package_branches_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_branches" ADD CONSTRAINT "package_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_services" ADD CONSTRAINT "bundle_services_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_services" ADD CONSTRAINT "bundle_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
