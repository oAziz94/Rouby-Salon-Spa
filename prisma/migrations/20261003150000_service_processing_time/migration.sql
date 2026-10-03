-- Processing-time model: part of a service during which the stylist is free
ALTER TABLE "services" ADD COLUMN "processing_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "services" ADD COLUMN "processing_starts_after_minutes" INTEGER NOT NULL DEFAULT 0;
