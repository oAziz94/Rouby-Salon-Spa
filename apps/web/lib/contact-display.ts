import type { PublicBranch, PublicSiteContent } from "@/lib/api/public";

/** Public site phone: same display and `tel:` href as footer and contact page. */
export const PUBLIC_SALON_PHONE = {
  display: "015 11100956",
  telHref: "tel:+201511100956",
} as const;

/** Shown only when site-content and branch APIs omit these fields. Not catalog/pricing. */
export const ALROUBY_CONTACT_FALLBACK = {
  address: "15 Radwan Ibn AlTabib Off Murad st., Giza",
  openingHours: "Daily: 11:00 AM - 9:00 PM",
  phoneDisplay: PUBLIC_SALON_PHONE.display,
  /** Digits for wa.me (Egypt), aligned with `PUBLIC_SALON_PHONE.telHref`. */
  whatsappDigits: "201511100956",
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getContactSectionFromSiteContent(siteContent: PublicSiteContent | null) {
  const section = asRecord(siteContent?.contactSection);
  return {
    phone: readString(section.phone),
    whatsapp: readString(section.whatsapp),
    address: readString(section.address),
    openingHours: readString(section.openingHours),
  };
}

export function formatWorkingHours(workingHours: unknown): string | null {
  if (typeof workingHours === "string" && workingHours.trim().length > 0) {
    return workingHours.trim();
  }
  if (workingHours && typeof workingHours === "object" && !Array.isArray(workingHours)) {
    const entries = Object.entries(workingHours as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && String(v).trim().length > 0,
    );
    if (entries.length === 0) {
      return null;
    }
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join("\n");
  }
  return null;
}

function toWhatsAppDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export type MergedPublicContact = {
  address: string;
  openingHours: string;
  /** E.164-ish digits only, for wa.me */
  whatsappDigits: string;
};

/**
 * Prefer branch data when present, then site `contactSection`, then static salon defaults.
 */
export function mergePublicContactDisplay(
  siteContent: PublicSiteContent | null,
  branches: PublicBranch[],
): MergedPublicContact {
  const contact = getContactSectionFromSiteContent(siteContent);
  const primary = branches[0];

  const address =
    readString(primary?.address) ?? contact.address ?? ALROUBY_CONTACT_FALLBACK.address;

  const openingHours =
    formatWorkingHours(primary?.workingHours) ??
    contact.openingHours ??
    ALROUBY_CONTACT_FALLBACK.openingHours;

  const whatsappRaw =
    readString(primary?.whatsapp) ??
    contact.whatsapp ??
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() : undefined) ??
    `+${ALROUBY_CONTACT_FALLBACK.whatsappDigits}`;

  const whatsappDigits =
    toWhatsAppDigits(whatsappRaw).length > 0
      ? toWhatsAppDigits(whatsappRaw)
      : ALROUBY_CONTACT_FALLBACK.whatsappDigits;

  return {
    address,
    openingHours,
    whatsappDigits,
  };
}

export function buildWhatsAppUrl(phoneDigits: string, text: string): string {
  const cleaned = phoneDigits.replace(/[^\d]/g, "");
  const params = new URLSearchParams({ text });
  return `https://wa.me/${cleaned}?${params.toString()}`;
}
