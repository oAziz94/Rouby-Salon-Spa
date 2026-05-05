import { Prisma } from '@prisma/client';

export function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value.toString());
}

export function utcDateOnly(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function buildListMeta(params: {
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const { page, pageSize, totalItems } = params;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
  };
}
