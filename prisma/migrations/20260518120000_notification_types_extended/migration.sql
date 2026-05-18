-- Booking request, rejection, and staff reschedule notification types.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_RESCHEDULED';
