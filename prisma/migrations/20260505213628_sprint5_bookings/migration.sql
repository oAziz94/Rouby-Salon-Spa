-- CreateEnum
CREATE TYPE "ClientIdentityProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REQUIRES_FOLLOW_UP', 'RESCHEDULED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WEBSITE', 'DASHBOARD', 'WALK_IN', 'PHONE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "BookingItemType" AS ENUM ('SERVICE', 'SERVICE_VARIANT', 'PACKAGE', 'BUNDLE', 'ADD_ON');

-- CreateEnum
CREATE TYPE "BookingChangeRequestType" AS ENUM ('CANCEL', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "BookingChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "profile_image_url" TEXT,
    "gender" TEXT,
    "birth_date" DATE,
    "preferred_branch_id" UUID,
    "notes" TEXT,
    "allergies_or_warnings" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_identities" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "provider" "ClientIdentityProvider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "source" "BookingSource" NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(6,5) NOT NULL,
    "vat_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "client_notes" TEXT,
    "admin_notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_items" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "item_type" "BookingItemType" NOT NULL,
    "service_id" UUID,
    "service_variant_id" UUID,
    "package_id" UUID,
    "bundle_id" UUID,
    "name_snapshot" TEXT NOT NULL,
    "price_snapshot" DECIMAL(12,2) NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_change_requests" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "request_type" "BookingChangeRequestType" NOT NULL,
    "requested_slot_id" UUID,
    "reason" TEXT,
    "status" "BookingChangeRequestStatus" NOT NULL,
    "handled_by_user_id" UUID,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_phone_idx" ON "clients"("phone");

-- CreateIndex
CREATE INDEX "client_identities_client_id_idx" ON "client_identities"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_identities_provider_provider_subject_key" ON "client_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "bookings_client_id_created_at_idx" ON "bookings"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_branch_id_status_slot_id_idx" ON "bookings"("branch_id", "status", "slot_id");

-- CreateIndex
CREATE INDEX "bookings_slot_id_idx" ON "bookings"("slot_id");

-- CreateIndex
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");

-- CreateIndex
CREATE INDEX "booking_change_requests_booking_id_status_idx" ON "booking_change_requests"("booking_id", "status");

-- CreateIndex
CREATE INDEX "booking_change_requests_client_id_created_at_idx" ON "booking_change_requests"("client_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_preferred_branch_id_fkey" FOREIGN KEY ("preferred_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_identities" ADD CONSTRAINT "client_identities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "booking_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_requested_slot_id_fkey" FOREIGN KEY ("requested_slot_id") REFERENCES "booking_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
