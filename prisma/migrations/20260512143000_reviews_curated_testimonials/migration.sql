-- Curated testimonials: rename website flag, add admin fields, enforce at most one homepage selection.
-- Invariant: at most one row may have show_on_homepage = true (partial unique index + transactional updates in app).

DROP INDEX IF EXISTS "reviews_status_display_on_website_created_at_idx";

ALTER TABLE "reviews" RENAME COLUMN "display_on_website" TO "show_on_homepage";

ALTER TABLE "reviews" ADD COLUMN "client_name" TEXT,
ADD COLUMN "client_title" TEXT,
ADD COLUMN "service_name" TEXT,
ADD COLUMN "branch_id" UUID,
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "source" TEXT,
ADD COLUMN "created_by_user_id" UUID,
ADD COLUMN "updated_by_user_id" UUID;

UPDATE "reviews" SET "is_active" = ("status" = 'APPROVED'::"ReviewStatus");

UPDATE "reviews" SET "show_on_homepage" = false WHERE "show_on_homepage" = true AND "is_active" = false;

WITH "ranked" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "updated_at" DESC, "created_at" DESC) AS "rn"
  FROM "reviews"
  WHERE "show_on_homepage" = true
)
UPDATE "reviews" "r"
SET "show_on_homepage" = false
FROM "ranked"
WHERE "r"."id" = "ranked"."id" AND "ranked"."rn" > 1;

CREATE UNIQUE INDEX "reviews_single_show_on_homepage_idx" ON "reviews" ((1)) WHERE "show_on_homepage" = true;

CREATE INDEX "reviews_is_active_show_on_homepage_updated_at_idx" ON "reviews"("is_active", "show_on_homepage", "updated_at" DESC);

CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "created_at" DESC);

CREATE INDEX "reviews_branch_id_idx" ON "reviews"("branch_id");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
