-- Loyalty program: settings, ledger, LOYALTY payment method (all additive)
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'LOYALTY';

CREATE TYPE "LoyaltyTransactionType" AS ENUM ('REDEEM_POINTS', 'REWARD', 'ADJUST');

ALTER TABLE "system_settings"
  ADD COLUMN "loyalty_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "loyalty_points_per_egp" DECIMAL(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN "loyalty_redeem_points" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "loyalty_redeem_value" DECIMAL(12,2) NOT NULL DEFAULT 50,
  ADD COLUMN "loyalty_visits_for_reward" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "loyalty_reward_service_id" UUID,
  ADD COLUMN "loyalty_started_at" TIMESTAMP(3);

CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "amount_egp" DECIMAL(12,2),
    "payment_id" UUID,
    "booking_id" UUID,
    "note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loyalty_transactions_payment_id_key" ON "loyalty_transactions"("payment_id");
CREATE INDEX "loyalty_transactions_client_id_created_at_idx" ON "loyalty_transactions"("client_id", "created_at");

ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
