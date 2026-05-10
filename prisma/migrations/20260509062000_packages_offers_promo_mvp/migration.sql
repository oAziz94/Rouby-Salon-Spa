-- CreateEnum
CREATE TYPE "OfferAppliesTo" AS ENUM ('ALL', 'SERVICES', 'PACKAGES');

-- AlterTable
ALTER TABLE "offers"
ADD COLUMN "description" TEXT,
ADD COLUMN "minimum_spend" DECIMAL(12,2),
ADD COLUMN "applies_to" "OfferAppliesTo" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "bookings"
ADD COLUMN "applied_offer_id" UUID,
ADD COLUMN "applied_promo_code" TEXT,
ADD COLUMN "promo_snapshot" JSONB;
