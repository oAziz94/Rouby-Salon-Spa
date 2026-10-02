-- Batch 3: holidays & closures, day-close open-items policy. Additive only.

CREATE TYPE "DayCloseOpenItemsPolicy" AS ENUM ('ALERT', 'BLOCK');

ALTER TABLE "system_settings"
  ADD COLUMN "day_close_open_items_policy" "DayCloseOpenItemsPolicy" NOT NULL DEFAULT 'ALERT';

ALTER TABLE "daily_closings"
  ADD COLUMN "carry_over_reason" TEXT;

CREATE TABLE "branch_closures" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_closures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_closures_branch_id_start_date_end_date_idx"
  ON "branch_closures"("branch_id", "start_date", "end_date");

ALTER TABLE "branch_closures"
  ADD CONSTRAINT "branch_closures_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_slots"
  ADD COLUMN "closed_by_closure_id" UUID;

CREATE INDEX "booking_slots_closed_by_closure_id_idx"
  ON "booking_slots"("closed_by_closure_id");

ALTER TABLE "booking_slots"
  ADD CONSTRAINT "booking_slots_closed_by_closure_id_fkey"
  FOREIGN KEY ("closed_by_closure_id") REFERENCES "branch_closures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
