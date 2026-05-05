import { SetMetadata } from '@nestjs/common';
import { ANY_PERMISSIONS_KEY } from '../auth.constants';

/** Require at least one of the listed permissions (OR). */
export const RequireAnyPermissions = (...keys: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, keys);
