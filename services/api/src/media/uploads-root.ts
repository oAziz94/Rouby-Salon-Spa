import { ConfigService } from '@nestjs/config';
import { join } from 'path';

export function resolveUploadsRoot(config: ConfigService): string {
  const relative = config.get<string>('MEDIA_STORAGE_ROOT')?.trim();
  if (relative) {
    return join(process.cwd(), relative);
  }
  return join(process.cwd(), 'uploads');
}
