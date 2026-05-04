import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends DashboardJwtUser {}
  }
}

export {};
