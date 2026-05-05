/**
 * Normalize user-entered WhatsApp number to digits only for `wa.me/{digits}` path.
 */
export function normalizeWhatsappDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function buildWaMeUrl(phoneDigits: string, messageText: string): string {
  const encoded = encodeURIComponent(messageText);
  return `https://wa.me/${phoneDigits}?text=${encoded}`;
}
