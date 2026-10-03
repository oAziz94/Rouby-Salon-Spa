import { Prisma } from '@prisma/client';

/** Postgres SQLSTATEs for "lost the race, run it again". */
const PG_RETRY_CODES = new Set(['40001', '40P01']);

/**
 * Postgres aborts one of two overlapping SERIALIZABLE transactions. Prisma reports it as
 * P2034 for model queries, but a `$executeRaw`/`$queryRaw` inside the same transaction (the
 * slot-capacity UPDATE) surfaces as P2010 "raw query failed" with the SQLSTATE in `meta.code`.
 */
export function isSerializationFailure(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2034') return true;
  // Transaction API timed out waiting for a connection / conflict under load.
  if (err.code === 'P2028') return true;
  if (err.code === 'P2010') {
    const pg = (err.meta as { code?: unknown } | undefined)?.code;
    if (typeof pg === 'string' && PG_RETRY_CODES.has(pg)) return true;
    return /could not serialize access|deadlock detected/i.test(err.message);
  }
  return false;
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
