-- CreateEnum
CREATE TYPE "CashDrawerSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashDrawerMovementType" AS ENUM ('CASH_IN', 'CASH_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DailyClosingStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "CashDrawerSessionStatus" NOT NULL,
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "expected_cash" DECIMAL(12,2) NOT NULL,
    "counted_cash" DECIMAL(12,2),
    "cash_difference" DECIMAL(12,2),
    "opened_by_user_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_movements" (
    "id" UUID NOT NULL,
    "drawer_session_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "CashDrawerMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drawer_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closings" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "DailyClosingStatus" NOT NULL,
    "cash_drawer_session_id" UUID,
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMP(3),
    "total_invoices" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gross_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "instapay_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wallet_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_transfer_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expected_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "counted_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash_difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoice_count" INTEGER NOT NULL DEFAULT 0,
    "payment_count" INTEGER NOT NULL DEFAULT 0,
    "booking_count" INTEGER NOT NULL DEFAULT 0,
    "completed_booking_count" INTEGER NOT NULL DEFAULT 0,
    "in_progress_booking_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_booking_count" INTEGER NOT NULL DEFAULT 0,
    "queue_visit_count" INTEGER NOT NULL DEFAULT 0,
    "queue_completed_count" INTEGER NOT NULL DEFAULT 0,
    "queue_active_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_drawer_sessions_branch_id_status_idx" ON "cash_drawer_sessions"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawer_sessions_branch_id_business_date_key" ON "cash_drawer_sessions"("branch_id", "business_date");

-- CreateIndex
CREATE INDEX "cash_drawer_movements_drawer_session_id_created_at_idx" ON "cash_drawer_movements"("drawer_session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_drawer_movements_branch_id_idx" ON "cash_drawer_movements"("branch_id");

-- CreateIndex
CREATE INDEX "daily_closings_branch_id_status_idx" ON "daily_closings"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closings_branch_id_business_date_key" ON "daily_closings"("branch_id", "business_date");

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_drawer_session_id_fkey" FOREIGN KEY ("drawer_session_id") REFERENCES "cash_drawer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_cash_drawer_session_id_fkey" FOREIGN KEY ("cash_drawer_session_id") REFERENCES "cash_drawer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
