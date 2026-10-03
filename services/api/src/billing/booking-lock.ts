import { Prisma } from '@prisma/client';

/**
 * Serializes everything that writes payments for one booking. Call it first inside the
 * transaction: the next read of the invoice balance then sees every payment committed by a
 * request that held the lock before us, so two parallel payments cannot both fit the same balance.
 */
export async function lockBookingForPayments(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`,
  );
}
