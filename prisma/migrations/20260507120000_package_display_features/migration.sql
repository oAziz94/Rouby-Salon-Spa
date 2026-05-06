-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "short_description" TEXT,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "badge_label" TEXT;

-- AlterTable: allow unknown duration at DB level (booking uses coalesced snapshot)
ALTER TABLE "packages" ALTER COLUMN "duration_minutes" DROP NOT NULL;

-- CreateTable
CREATE TABLE "package_features" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_features_package_id_is_active_display_order_idx" ON "package_features"("package_id", "is_active", "display_order");

-- CreateIndex
CREATE INDEX "packages_is_featured_idx" ON "packages"("is_featured");

-- AddForeignKey
ALTER TABLE "package_features" ADD CONSTRAINT "package_features_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
