import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { Express } from 'express';
import {
  expectedImageUrlForKey,
  parsePublicMediaBaseUrls,
  SERVICE_IMAGE_KEY_RE,
} from '../catalog/service-image-policy';
import { resolveUploadsRoot } from './uploads-root';

const MAX_BYTES = 5 * 1024 * 1024;

type Sniffed = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: string };

function sniffImage(buffer: Buffer): Sniffed | null {
  if (buffer.length < 12) {
    return null;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function safeOriginalName(name: string | undefined): string {
  const base =
    (name ?? 'upload').replace(/\\/g, '/').split('/').pop() ?? 'upload';
  return base.replace(/[^\w.\- ()]+/g, '_').slice(0, 200);
}

@Injectable()
export class MediaUploadService {
  constructor(private readonly config: ConfigService) {}

  async saveDashboardImage(file: Express.Multer.File): Promise<{
    imageUrl: string;
    imageKey: string;
    originalName: string;
    size: number;
    mimeType: string;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file');
    }
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException('File too large (max 5MB)');
    }
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new BadRequestException(
        'Unsupported or invalid image (allowed: JPEG, PNG, WebP)',
      );
    }
    const id = randomUUID();
    const filename = `${id}.${sniffed.ext}`;
    const imageKey = `media/${filename}`;
    const dir = join(resolveUploadsRoot(this.config), 'media');
    await fs.mkdir(dir, { recursive: true });
    const diskPath = join(dir, filename);
    await fs.writeFile(diskPath, file.buffer);

    const bases = parsePublicMediaBaseUrls(
      this.config.get<string>('PUBLIC_MEDIA_BASE_URL'),
    );
    const primaryBase = bases[0] ?? 'http://localhost:4000';
    const candidates = expectedImageUrlForKey(imageKey, bases);
    const imageUrl = candidates.includes(`${primaryBase}/uploads/${imageKey}`)
      ? `${primaryBase}/uploads/${imageKey}`
      : (candidates[0] ?? `${primaryBase}/uploads/${imageKey}`);

    return {
      imageUrl,
      imageKey,
      originalName: safeOriginalName(file.originalname),
      size: file.buffer.length,
      mimeType: sniffed.mime,
    };
  }

  /** Removes a file previously saved under `media/<uuid>.(jpg|png|webp)`. */
  async deleteStoredImage(imageKey: string): Promise<void> {
    const key = imageKey.trim();
    if (!SERVICE_IMAGE_KEY_RE.test(key)) {
      return;
    }
    const diskPath = join(resolveUploadsRoot(this.config), key);
    await fs.unlink(diskPath).catch(() => undefined);
  }
}
