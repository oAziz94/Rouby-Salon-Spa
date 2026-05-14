/**
 * One-off migration: upload local salon media files to Cloudinary and update DB URLs.
 *
 * From repo root:
 *   DRY_RUN=true tsx scripts/migrate-media-to-cloudinary.ts
 *   tsx scripts/migrate-media-to-cloudinary.ts
 *
 * Env: DATABASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 * optional CLOUDINARY_FOLDER (default alrouby), MEDIA_STORAGE_ROOT (relative to repo root;
 * default services/api/uploads).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const DRY_RUN =
  (process.env.DRY_RUN ?? '').toLowerCase() === 'true' ||
  process.env.DRY_RUN === '1';

const FOLDER = (process.env.CLOUDINARY_FOLDER ?? 'alrouby').trim().replace(/\/+$/, '');

const repoRoot = process.cwd();

function resolveUploadsRoot(): string {
  const rel = process.env.MEDIA_STORAGE_ROOT?.trim();
  if (rel) {
    return join(repoRoot, rel);
  }
  return join(repoRoot, 'services', 'api', 'uploads');
}

function isCloudinaryOrNonLocalUploads(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (/res\.cloudinary\.com/i.test(u)) return true;
  if (/^https?:\/\//i.test(u) && !u.includes('/uploads/')) return true;
  return false;
}

const LOCAL_MEDIA_KEY_RE =
  /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$/i;

/** Extract `media/<uuid>.(jpg|png|webp)` from a URL containing `/uploads/`. */
function extractMediaKey(url: string): string | null {
  const u = url.trim();
  const idx = u.indexOf('/uploads/');
  if (idx === -1) return null;
  const tail = u.slice(idx + '/uploads/'.length).split('?')[0]?.trim() ?? '';
  return LOCAL_MEDIA_KEY_RE.test(tail) ? tail : null;
}

function localDiskPathForMediaKey(key: string): string | null {
  const full = join(resolveUploadsRoot(), key);
  return existsSync(full) ? full : null;
}

type Totals = {
  scanned: number;
  skippedNonLocal: number;
  skippedMissingFile: number;
  migrated: number;
  errors: number;
};

function emptyTotals(): Totals {
  return {
    scanned: 0,
    skippedNonLocal: 0,
    skippedMissingFile: 0,
    migrated: 0,
    errors: 0,
  };
}

function addTotals(a: Totals, b: Totals): void {
  a.scanned += b.scanned;
  a.skippedNonLocal += b.skippedNonLocal;
  a.skippedMissingFile += b.skippedMissingFile;
  a.migrated += b.migrated;
  a.errors += b.errors;
}

async function uploadBuffer(
  buffer: Buffer,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
  publicId: string,
): Promise<{ secure_url: string; public_id: string }> {
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
  const res = await new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    cloudinary.uploader.upload(
      dataUri,
      {
        folder: FOLDER,
        public_id: publicId,
        overwrite: false,
        resource_type: 'image',
        invalidate: true,
      },
      (err, result) => {
        if (err || !result?.secure_url || !result.public_id) {
          reject(err ?? new Error('Cloudinary upload failed'));
        } else {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        }
      },
    );
  });
  return res;
}

function mimeFromPath(p: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  const lower = p.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function main(): Promise<void> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    console.error(
      'Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.',
    );
    process.exit(1);
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const prisma = new PrismaClient();
  const grand = emptyTotals();

  const logPrefix = DRY_RUN ? '[dry-run]' : '[migrate]';
  console.log(
    `${logPrefix} uploads root=${resolveUploadsRoot()} folder=${FOLDER}`,
  );

  try {
    // --- Gallery ---
    const galleryRows = await prisma.galleryItem.findMany({
      select: { id: true, imageUrl: true, storageKey: true },
    });
    const gTot = emptyTotals();
    for (const row of galleryRows) {
      gTot.scanned += 1;
      const url = row.imageUrl;
      if (isCloudinaryOrNonLocalUploads(url)) {
        gTot.skippedNonLocal += 1;
        continue;
      }
      const key =
        row.storageKey?.trim() && LOCAL_MEDIA_KEY_RE.test(row.storageKey)
          ? row.storageKey
          : extractMediaKey(url);
      if (!key) {
        gTot.skippedNonLocal += 1;
        continue;
      }
      const disk = localDiskPathForMediaKey(key);
      if (!disk) {
        console.warn(`${logPrefix} gallery missing file id=${row.id} key=${key}`);
        gTot.skippedMissingFile += 1;
        continue;
      }
      const buf = readFileSync(disk);
      const id = randomUUID();
      try {
        if (DRY_RUN) {
          console.log(
            `${logPrefix} gallery id=${row.id} would upload ${disk} public_id=${FOLDER}/${id}`,
          );
          gTot.migrated += 1;
          continue;
        }
        const up = await uploadBuffer(buf, mimeFromPath(disk), id);
        await prisma.galleryItem.update({
          where: { id: row.id },
          data: { imageUrl: up.secure_url, storageKey: up.public_id },
        });
        console.log(`${logPrefix} gallery id=${row.id} ok`);
        gTot.migrated += 1;
      } catch (e) {
        gTot.errors += 1;
        console.error(`${logPrefix} gallery id=${row.id}`, e);
      }
    }
    console.log(`${logPrefix} gallery summary`, gTot);
    addTotals(grand, gTot);

    // --- Services (direct imageUrl, not only gallery-linked) ---
    const svcRows = await prisma.service.findMany({
      where: { imageUrl: { not: null } },
      select: { id: true, imageUrl: true, imageKey: true },
    });
    const sTot = emptyTotals();
    for (const row of svcRows) {
      sTot.scanned += 1;
      const url = row.imageUrl!;
      if (isCloudinaryOrNonLocalUploads(url)) {
        sTot.skippedNonLocal += 1;
        continue;
      }
      const key =
        row.imageKey?.trim() && LOCAL_MEDIA_KEY_RE.test(row.imageKey)
          ? row.imageKey
          : extractMediaKey(url);
      if (!key) {
        sTot.skippedNonLocal += 1;
        continue;
      }
      const disk = localDiskPathForMediaKey(key);
      if (!disk) {
        console.warn(`${logPrefix} service missing file id=${row.id} key=${key}`);
        sTot.skippedMissingFile += 1;
        continue;
      }
      const buf = readFileSync(disk);
      const id = randomUUID();
      try {
        if (DRY_RUN) {
          console.log(`${logPrefix} service id=${row.id} would upload ${disk}`);
          sTot.migrated += 1;
          continue;
        }
        const up = await uploadBuffer(buf, mimeFromPath(disk), id);
        await prisma.service.update({
          where: { id: row.id },
          data: { imageUrl: up.secure_url, imageKey: up.public_id },
        });
        console.log(`${logPrefix} service id=${row.id} ok`);
        sTot.migrated += 1;
      } catch (e) {
        sTot.errors += 1;
        console.error(`${logPrefix} service id=${row.id}`, e);
      }
    }
    console.log(`${logPrefix} services summary`, sTot);
    addTotals(grand, sTot);

    async function migrateSimpleUrlTable(
      name: string,
      fetchRows: () => Promise<Array<{ id: string; imageUrl: string | null }>>,
      update: (id: string, url: string) => Promise<void>,
    ): Promise<Totals> {
      const t = emptyTotals();
      const rows = await fetchRows();
      for (const row of rows) {
        t.scanned += 1;
        const url = row.imageUrl;
        if (!url?.trim() || isCloudinaryOrNonLocalUploads(url)) {
          t.skippedNonLocal += 1;
          continue;
        }
        const key = extractMediaKey(url);
        if (!key) {
          t.skippedNonLocal += 1;
          continue;
        }
        const disk = localDiskPathForMediaKey(key);
        if (!disk) {
          console.warn(`${logPrefix} ${name} missing file id=${row.id}`);
          t.skippedMissingFile += 1;
          continue;
        }
        const buf = readFileSync(disk);
        const id = randomUUID();
        try {
          if (DRY_RUN) {
            t.migrated += 1;
            continue;
          }
          const up = await uploadBuffer(buf, mimeFromPath(disk), id);
          await update(row.id, up.secure_url);
          t.migrated += 1;
        } catch (e) {
          t.errors += 1;
          console.error(`${logPrefix} ${name} id=${row.id}`, e);
        }
      }
      console.log(`${logPrefix} ${name} summary`, t);
      return t;
    }

    addTotals(
      grand,
      await migrateSimpleUrlTable(
        'service_categories',
        () =>
          prisma.serviceCategory.findMany({
            where: { imageUrl: { not: null } },
            select: { id: true, imageUrl: true },
          }),
        (id, url) =>
          prisma.serviceCategory.update({
            where: { id },
            data: { imageUrl: url },
          }),
      ),
    );

    addTotals(
      grand,
      await migrateSimpleUrlTable(
        'packages',
        () =>
          prisma.package.findMany({
            where: { imageUrl: { not: null } },
            select: { id: true, imageUrl: true },
          }),
        (id, url) =>
          prisma.package.update({ where: { id }, data: { imageUrl: url } }),
      ),
    );

    addTotals(
      grand,
      await migrateSimpleUrlTable(
        'service_enhancements',
        () =>
          prisma.serviceEnhancement.findMany({
            where: { imageUrl: { not: null } },
            select: { id: true, imageUrl: true },
          }),
        (id, url) =>
          prisma.serviceEnhancement.update({
            where: { id },
            data: { imageUrl: url },
          }),
      ),
    );

    addTotals(
      grand,
      await migrateSimpleUrlTable(
        'clients.profile_image_url',
        () =>
          prisma.client
            .findMany({
              where: { profileImageUrl: { not: null } },
              select: { id: true, profileImageUrl: true },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                imageUrl: r.profileImageUrl,
              })),
            ),
        (id, url) =>
          prisma.client.update({
            where: { id },
            data: { profileImageUrl: url },
          }),
      ),
    );

    console.log(`${logPrefix} TOTAL`, grand);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
