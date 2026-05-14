-- AlterTable
ALTER TABLE "booking_slots" ADD COLUMN "is_walk_in_bucket" BOOLEAN NOT NULL DEFAULT false;

-- One internal walk-in bucket row per branch per calendar day (UTC date column).
CREATE UNIQUE INDEX "booking_slots_walk_in_bucket_per_branch_date_idx"
ON "booking_slots" ("branch_id", "date")
WHERE "is_walk_in_bucket" = true AND "deleted_at" IS NULL;
