-- Align historical booking line statuses with booking outcomes (new columns default to PENDING).
UPDATE "booking_items" bi
SET "line_status" = 'COMPLETED'
FROM "bookings" b
WHERE bi."booking_id" = b."id" AND b."status" = 'COMPLETED';

UPDATE "booking_items" bi
SET "line_status" = 'CANCELLED'
FROM "bookings" b
WHERE bi."booking_id" = b."id" AND b."status" IN ('CANCELLED', 'REJECTED', 'NO_SHOW');
