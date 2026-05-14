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
import {
  configureCloudinaryFromEnv,
  destroyCloudinaryImage,
  uploadImageBufferToCloudinary,
} from './cloudinary.client';
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

function mediaStorageMode(config: ConfigService): 'local' | 'cloudinary' {
  const raw = (config.get<string>('MEDIA_STORAGE') ?? 'local').toLowerCase();
  return raw === 'cloudinary' ? 'cloudinary' : 'local';
}

function resolvePrimaryPublicMediaBase(config: ConfigService): string {
  const bases = parsePublicMediaBaseUrls(
    config.get<string>('PUBLIC_MEDIA_BASE_URL'),
  );
  if (bases[0]) {
    return bases[0];
  }
  const apiUrl = config.get<string>('API_URL')?.trim().replace(/\/+$/, '');
  if (apiUrl) {
    return apiUrl;
  }
  const render = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, '');
  if (render) {
    return render;
  }
  const isProd = config.get<string>('NODE_ENV') === 'production';
  if (isProd) {
    throw new BadRequestException(
      'PUBLIC_MEDIA_BASE_URL or API_URL must be set when using local media storage in production',
    );
  }
  return 'http://localhost:4000';
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

    if (mediaStorageMode(this.config) === 'cloudinary') {
      const cloudName = this.config
        .get<string>('CLOUDINARY_CLOUD_NAME')
        ?.trim();
      const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
      const apiSecret = this.config
        .get<string>('CLOUDINARY_API_SECRET')
        ?.trim();
      const folder =
        this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'alrouby';
      if (!cloudName || !apiKey || !apiSecret) {
        throw new BadRequestException(
          'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)',
        );
      }
      configureCloudinaryFromEnv({
        CLOUDINARY_CLOUD_NAME: cloudName,
        CLOUDINARY_API_KEY: apiKey,
        CLOUDINARY_API_SECRET: apiSecret,
      });
      const id = randomUUID();
      const uploaded = await uploadImageBufferToCloudinary({
        buffer: file.buffer,
        folder,
        publicId: id,
        mime: sniffed.mime,
      });
      return {
        imageUrl: uploaded.secure_url,
        imageKey: uploaded.public_id,
        originalName: safeOriginalName(file.originalname),
        size: file.buffer.length,
        mimeType: sniffed.mime,
      };
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
    const primaryBase = resolvePrimaryPublicMediaBase(this.config);
    const candidates = expectedImageUrlForKey(
      imageKey,
      bases.length ? bases : [primaryBase],
    );
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

  /**
   * Removes a file previously saved under `media/<uuid>.(jpg|png|webp)`, or a Cloudinary asset
   * by `public_id` when using folder-based ids from the dashboard uploader.
   */
  async deleteStoredImage(imageKey: string): Promise<void> {
    const key = imageKey.trim();
    if (!key) {
      return;
    }
    if (SERVICE_IMAGE_KEY_RE.test(key)) {
      const diskPath = join(resolveUploadsRoot(this.config), key);
      await fs.unlink(diskPath).catch(() => undefined);
      return;
    }
    const folder =
      this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'alrouby';
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (!cloudName || !apiKey || !apiSecret || !key.startsWith(`${folder}/`)) {
      return;
    }
    configureCloudinaryFromEnv({
      CLOUDINARY_CLOUD_NAME: cloudName,
      CLOUDINARY_API_KEY: apiKey,
      CLOUDINARY_API_SECRET: apiSecret,
    });
    await destroyCloudinaryImage(key).catch(() => undefined);
  }
}
