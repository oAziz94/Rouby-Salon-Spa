-- Service module enrichment: marketing fields, service benefits, service enhancements.

ALTER TABLE "services"
ADD COLUMN "short_description" TEXT,
ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "badge_label" TEXT;

CREATE TABLE "service_benefits" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_benefits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_enhancements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "short_description" TEXT,
    "price" DECIMAL(12,2),
    "duration_minutes" INTEGER,
    "image_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_enhancements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_benefits_service_id_is_active_display_order_idx"
ON "service_benefits"("service_id", "is_active", "display_order");

CREATE INDEX "service_enhancements_is_active_display_order_idx"
ON "service_enhancements"("is_active", "display_order");

ALTER TABLE "service_benefits"
ADD CONSTRAINT "service_benefits_service_id_fkey"
FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
