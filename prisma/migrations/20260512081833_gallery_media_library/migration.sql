-- CreateEnum
CREATE TYPE "GalleryItemLibraryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "gallery_items" ADD COLUMN     "alt_text" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "library_status" "GalleryItemLibraryStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "original_name" TEXT,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "storage_key" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "uploaded_by_user_id" UUID,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "image_media_id" UUID;

-- CreateTable
CREATE TABLE "media_usages" (
    "id" UUID NOT NULL,
    "gallery_item_id" UUID NOT NULL,
    "usage_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "section_key" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_usages_gallery_item_id_idx" ON "media_usages"("gallery_item_id");

-- CreateIndex
CREATE INDEX "media_usages_usage_type_entity_id_idx" ON "media_usages"("usage_type", "entity_id");

-- CreateIndex
CREATE INDEX "gallery_items_library_status_created_at_idx" ON "gallery_items"("library_status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "gallery_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_gallery_item_id_fkey" FOREIGN KEY ("gallery_item_id") REFERENCES "gallery_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
