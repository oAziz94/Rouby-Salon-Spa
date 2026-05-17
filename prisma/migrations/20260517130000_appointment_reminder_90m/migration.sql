-- Second appointment reminder: ~90 minutes before slot start.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REMINDER_90M';
