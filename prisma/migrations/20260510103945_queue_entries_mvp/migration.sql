-- CreateEnum
CREATE TYPE "QueueEntrySource" AS ENUM ('BOOKING', 'WALK_IN');

-- CreateEnum
CREATE TYPE "QueueEntryStatus" AS ENUM ('WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "booking_id" UUID,
    "client_id" UUID,
    "source" "QueueEntrySource" NOT NULL,
    "status" "QueueEntryStatus" NOT NULL,
    "client_name_snapshot" TEXT NOT NULL,
    "client_phone_snapshot" TEXT,
    "service_summary_snapshot" TEXT,
    "items_snapshot" JSONB,
    "notes" TEXT,
    "checked_in_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queue_entries_branch_id_checked_in_at_idx" ON "queue_entries"("branch_id", "checked_in_at" DESC);

-- CreateIndex
CREATE INDEX "queue_entries_booking_id_idx" ON "queue_entries"("booking_id");

-- CreateIndex
CREATE INDEX "queue_entries_branch_id_status_idx" ON "queue_entries"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
