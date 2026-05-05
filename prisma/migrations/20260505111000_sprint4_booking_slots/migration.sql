-- CreateEnum
CREATE TYPE "BookingSlotStatus" AS ENUM ('AVAILABLE', 'PENDING', 'FILLED', 'BLOCKED', 'CLOSED');

-- CreateTable
CREATE TABLE "booking_slots" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingSlotStatus" NOT NULL,
    "is_online_bookable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_slots_branch_id_date_idx" ON "booking_slots"("branch_id", "date");

-- CreateIndex
CREATE INDEX "booking_slots_branch_id_date_start_time_idx" ON "booking_slots"("branch_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "booking_slots_created_by_user_id_idx" ON "booking_slots"("created_by_user_id");

-- CreateIndex
CREATE INDEX "booking_slots_deleted_at_idx" ON "booking_slots"("deleted_at");

-- AddForeignKey
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
