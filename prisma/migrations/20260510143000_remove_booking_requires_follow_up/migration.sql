-- Re-home any legacy rows, then drop REQUIRES_FOLLOW_UP from BookingStatus.
UPDATE "bookings" SET "status" = 'PENDING' WHERE "status" = 'REQUIRES_FOLLOW_UP';

ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
CREATE TYPE "BookingStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'RESCHEDULED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW'
);

ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "BookingStatus" USING ("status"::text::"BookingStatus");

DROP TYPE "BookingStatus_old";
