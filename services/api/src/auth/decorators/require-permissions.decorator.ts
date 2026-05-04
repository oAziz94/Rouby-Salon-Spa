import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../auth.constants';

/** Require every listed permission (AND). */
export const RequirePermissions = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);
