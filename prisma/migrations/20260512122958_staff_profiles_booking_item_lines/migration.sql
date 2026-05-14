-- CreateEnum
CREATE TYPE "BookingItemLineStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffScheduleExceptionType" AS ENUM ('DAY_OFF', 'CUSTOM_HOURS', 'EXTRA_SHIFT');

-- AlterTable
ALTER TABLE "booking_items" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "line_status" "BookingItemLineStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "staff_profile_id" UUID,
ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "booking_item_id" UUID;

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "avatar_image_id" UUID,
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profile_services" (
    "id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_profile_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "break_start_time" TIME(0),
    "break_end_time" TIME(0),
    "is_working" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedule_exceptions" (
    "id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "StaffScheduleExceptionType" NOT NULL,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_profiles_branch_id_is_active_idx" ON "staff_profiles"("branch_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_branch_id_key" ON "staff_profiles"("user_id", "branch_id");

-- CreateIndex
CREATE INDEX "staff_profile_services_service_id_idx" ON "staff_profile_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profile_services_staff_profile_id_service_id_key" ON "staff_profile_services"("staff_profile_id", "service_id");

-- CreateIndex
CREATE INDEX "staff_schedules_branch_id_idx" ON "staff_schedules"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedules_staff_profile_id_branch_id_day_of_week_key" ON "staff_schedules"("staff_profile_id", "branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "staff_schedule_exceptions_branch_id_date_idx" ON "staff_schedule_exceptions"("branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedule_exceptions_staff_profile_id_date_key" ON "staff_schedule_exceptions"("staff_profile_id", "date");

-- CreateIndex
CREATE INDEX "booking_items_staff_profile_id_line_status_idx" ON "booking_items"("staff_profile_id", "line_status");

-- CreateIndex
CREATE INDEX "invoice_lines_booking_item_id_idx" ON "invoice_lines"("booking_item_id");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_avatar_image_id_fkey" FOREIGN KEY ("avatar_image_id") REFERENCES "gallery_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profile_services" ADD CONSTRAINT "staff_profile_services_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profile_services" ADD CONSTRAINT "staff_profile_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedule_exceptions" ADD CONSTRAINT "staff_schedule_exceptions_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedule_exceptions" ADD CONSTRAINT "staff_schedule_exceptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_booking_item_id_fkey" FOREIGN KEY ("booking_item_id") REFERENCES "booking_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
