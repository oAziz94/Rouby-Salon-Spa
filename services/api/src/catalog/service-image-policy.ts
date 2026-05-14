import { BadRequestException } from '@nestjs/common';

/** Relative storage path under the uploads root, e.g. `media/<uuid>.webp`. */
export const SERVICE_IMAGE_KEY_RE =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpeg|jpg|png|webp)$/i;

export function parsePublicMediaBaseUrls(raw: string | undefined): string[] {
  const fallback = 'http://localhost:4000';
  const src = (raw ?? fallback).trim();
  return src
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function expectedImageUrlForKey(
  imageKey: string,
  bases: readonly string[],
): string[] {
  const key = imageKey.trim();
  return bases.map((b) => `${b}/uploads/${key}`);
}

/** Derive `media/<uuid>.(jpg|png|webp)` key from a public uploads URL under allowed bases. */
export function parseStorageKeyFromAllowedImageUrl(
  imageUrl: string | null | undefined,
  bases: readonly string[],
): string | null {
  if (!imageUrl?.trim()) return null;
  const u = imageUrl.trim();
  for (const raw of bases) {
    const b = raw.replace(/\/+$/, '');
    const prefix = `${b}/uploads/`;
    if (u.startsWith(prefix)) {
      const key = u.slice(prefix.length).split('?')[0]?.trim() ?? '';
      return SERVICE_IMAGE_KEY_RE.test(key) ? key : null;
    }
  }
  return null;
}

/**
 * Ensures imageUrl/imageKey are either both absent/empty or both set and consistent with
 * an allowed public media origin (dashboard uploads).
 */
export function assertWritableServiceImagePair(
  imageUrl: string | null | undefined,
  imageKey: string | null | undefined,
  bases: readonly string[],
): void {
  const urlRaw = imageUrl === undefined ? undefined : imageUrl;
  const keyRaw = imageKey === undefined ? undefined : imageKey;

  const urlEmpty =
    urlRaw === undefined ||
    urlRaw === null ||
    (typeof urlRaw === 'string' && urlRaw.trim() === '');
  const keyEmpty =
    keyRaw === undefined ||
    keyRaw === null ||
    (typeof keyRaw === 'string' && keyRaw.trim() === '');

  if (urlEmpty && keyEmpty) {
    return;
  }
  if (urlEmpty !== keyEmpty) {
    throw new BadRequestException(
      'imageUrl and imageKey must be provided together, or both cleared together',
    );
  }
  const url = String(urlRaw).trim();
  const key = String(keyRaw).trim();
  if (!SERVICE_IMAGE_KEY_RE.test(key)) {
    throw new BadRequestException('Invalid imageKey');
  }
  const allowed = new Set(expectedImageUrlForKey(key, bases));
  if (!allowed.has(url)) {
    throw new BadRequestException(
      'Image URL must match an allowed media origin from this salon upload (paste URLs are not accepted)',
    );
  }
}

export function assertOnlineBookableRequiresImage(
  bookingAvailability: boolean,
  imageUrl: string | null,
): void {
  if (bookingAvailability && (!imageUrl || imageUrl.trim() === '')) {
    throw new BadRequestException(
      'Services available for online booking must have an uploaded image',
    );
  }
}
