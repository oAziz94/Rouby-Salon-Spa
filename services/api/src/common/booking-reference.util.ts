export function formatBookingReference(bookingId: string): string {
  const tail = bookingId.replace(/-/g, '').slice(-8).toUpperCase();
  return `RB-${tail}`;
}

/** Full UUID from 32 hex chars (no dashes). */
export function tryDashedUuid(compact: string): string | null {
  if (compact.length !== 32) {
    return null;
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

export function extractBookingIdSearchCompact(raw: string): string | null {
  let s = raw.trim();
  if (/^rb-/i.test(s)) {
    s = s.slice(3).trim();
  }
  s = s.replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(s)) {
    return null;
  }
  if (s.length < 4 || s.length > 32) {
    return null;
  }
  return s;
}
