-- Service catalog: storage key + alt text for uploaded hero images (dashboard upload flow).
ALTER TABLE "services" ADD COLUMN "image_key" TEXT;
ALTER TABLE "services" ADD COLUMN "image_alt" TEXT;
