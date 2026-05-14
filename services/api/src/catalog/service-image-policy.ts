import { BadRequestException } from '@nestjs/common';

/** Relative storage path under the uploads root, e.g. `media/<uuid>.webp`. */
export const SERVICE_IMAGE_KEY_RE =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpeg|jpg|png|webp)$/i;

export type DashboardMediaStorage = 'local' | 'cloudinary';

/** Optional context when `MEDIA_STORAGE=cloudinary` (service + gallery validation). */
export type ServiceImagePairContext = {
  mediaStorage: DashboardMediaStorage;
  cloudName?: string;
  folder?: string;
};

export function parsePublicMediaBaseUrls(raw: string | undefined): string[] {
  const isProd = process.env.NODE_ENV === 'production';
  const fallback = isProd ? '' : 'http://localhost:4000';
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

/** `public_id` under Cloudinary folder, e.g. `alrouby/<uuid>` (no file extension). */
export function isCloudinaryFolderPublicId(
  key: string | null | undefined,
  folder: string,
): boolean {
  const f = folder.trim().replace(/\/+$/, '');
  if (!f || !key?.trim()) return false;
  const k = key.trim();
  if (!k.startsWith(`${f}/`)) return false;
  const rest = k.slice(f.length + 1);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    rest,
  );
}

export function parsePublicIdFromCloudinaryImageUrl(
  url: string | null | undefined,
  cloudName: string,
): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!u.startsWith(prefix)) return null;
  let rest = (u.slice(prefix.length).split('?')[0] ?? '').replace(
    /^v\d+\//,
    '',
  );
  rest = rest.replace(/\.(jpe?g|png|webp)$/i, '');
  return rest || null;
}

export function isOurCloudinaryMediaUrl(
  url: string,
  cloudName: string | undefined,
): boolean {
  if (!cloudName?.trim()) return false;
  return url
    .trim()
    .startsWith(`https://res.cloudinary.com/${cloudName.trim()}/image/upload/`);
}

/** True for local `/uploads/` URLs under configured bases, or Cloudinary URLs for this cloud. */
export function isAllowedSalonImageUrl(
  url: string,
  bases: readonly string[],
  ctx?: ServiceImagePairContext,
): boolean {
  const u = url.trim();
  for (const raw of bases) {
    const b = raw.replace(/\/+$/, '');
    if (b && u.startsWith(`${b}/uploads/`)) return true;
  }
  if (ctx?.cloudName && isOurCloudinaryMediaUrl(u, ctx.cloudName)) {
    return true;
  }
  return false;
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

function assertCloudinaryWritablePair(
  imageUrl: string,
  imageKey: string,
  cloudName: string,
  folder: string,
): void {
  if (!isCloudinaryFolderPublicId(imageKey, folder)) {
    throw new BadRequestException('Invalid imageKey');
  }
  const parsed = parsePublicIdFromCloudinaryImageUrl(imageUrl, cloudName);
  if (parsed !== imageKey) {
    throw new BadRequestException(
      'Image URL must match the Cloudinary public id for this upload',
    );
  }
}

/**
 * Ensures imageUrl/imageKey are either both absent/empty or both set and consistent with
 * an allowed public media origin (dashboard uploads) or Cloudinary when configured.
 */
export function assertWritableServiceImagePair(
  imageUrl: string | null | undefined,
  imageKey: string | null | undefined,
  bases: readonly string[],
  ctx?: ServiceImagePairContext,
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

  if (
    ctx?.cloudName &&
    ctx.folder &&
    isCloudinaryFolderPublicId(key, ctx.folder)
  ) {
    assertCloudinaryWritablePair(url, key, ctx.cloudName, ctx.folder);
    return;
  }

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
