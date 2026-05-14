-- Website Content: dashboard-managed public marketing sections (non-catalog).

CREATE TABLE "website_content_sections" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "section_type" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "body" TEXT,
    "eyebrow" TEXT,
    "cta_label" TEXT,
    "cta_href" TEXT,
    "secondary_cta_label" TEXT,
    "secondary_cta_href" TEXT,
    "primary_gallery_item_id" UUID,
    "secondary_gallery_item_id" UUID,
    "content" JSONB,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_content_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "website_content_sections_key_key" ON "website_content_sections"("key");

CREATE INDEX "website_content_sections_page_display_order_idx" ON "website_content_sections"("page", "display_order");

ALTER TABLE "website_content_sections" ADD CONSTRAINT "website_content_sections_primary_gallery_item_id_fkey" FOREIGN KEY ("primary_gallery_item_id") REFERENCES "gallery_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_content_sections" ADD CONSTRAINT "website_content_sections_secondary_gallery_item_id_fkey" FOREIGN KEY ("secondary_gallery_item_id") REFERENCES "gallery_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_content_sections" ADD CONSTRAINT "website_content_sections_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
