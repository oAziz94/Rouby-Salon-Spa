import { Prisma } from '@prisma/client';

/** Postgres aborts one of two overlapping SERIALIZABLE transactions; Prisma reports it as P2034. */
export function isSerializationFailure(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2034' ||
      // Transaction API timed out waiting for a connection / conflict under load.
      err.code === 'P2028')
  );
}

/**
 * Re-runs a transaction that lost a serialization race (two receptionists booking the same
 * seat, closing the same visit…). Business errors are never retried. Short jittered backoff.
 */
export async function withSerializableRetry<T>(
  run: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 40;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isSerializationFailure(err) || attempt === attempts) {
        throw err;
      }
      const delay = base * attempt + Math.floor(Math.random() * base);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
