-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'BOOKING_CANCELLATION', 'CHANGE_REQUEST_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "branch_id" UUID,
    "booking_id" UUID,
    "change_request_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'wapilot',
    "status" "NotificationStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_booking_id_type_status_idx" ON "notification_logs"("booking_id", "type", "status");

-- CreateIndex
CREATE INDEX "notification_logs_change_request_id_type_status_idx" ON "notification_logs"("change_request_id", "type", "status");

-- CreateIndex
CREATE INDEX "notification_logs_status_type_created_at_idx" ON "notification_logs"("status", "type", "created_at");

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "booking_change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
