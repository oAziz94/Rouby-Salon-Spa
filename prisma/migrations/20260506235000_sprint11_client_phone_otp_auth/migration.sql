-- Sprint 11.4: client phone OTP auth foundations
-- Safety backfill: trim stored phones and normalize 00 prefix to +
UPDATE "clients"
SET "phone" = REGEXP_REPLACE(BTRIM("phone"), '^00', '+')
WHERE "phone" ~ '^00[0-9]+$';

UPDATE "clients"
SET "phone" = BTRIM("phone")
WHERE "phone" <> BTRIM("phone");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clients"
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique constraint on clients.phone: duplicate normalized phone values exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX "clients_phone_key" ON "clients"("phone");

CREATE TYPE "ClientOtpPurpose" AS ENUM ('LOGIN');

CREATE TABLE "client_otp_codes" (
  "id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "purpose" "ClientOtpPurpose" NOT NULL DEFAULT 'LOGIN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_otp_codes_phone_purpose_created_at_idx"
ON "client_otp_codes"("phone", "purpose", "created_at" DESC);

CREATE INDEX "client_otp_codes_expires_at_idx"
ON "client_otp_codes"("expires_at");
