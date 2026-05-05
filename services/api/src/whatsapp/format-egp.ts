import type { Prisma } from '@prisma/client';

export function formatEgpAmount(
  value: Prisma.Decimal | number | string,
): string {
  const n =
    typeof value === 'number'
      ? value
      : Number(typeof value === 'string' ? value : value.toString());
  if (!Number.isFinite(n)) {
    return '0.00 EGP';
  }
  return `${n.toFixed(2)} EGP`;
}
