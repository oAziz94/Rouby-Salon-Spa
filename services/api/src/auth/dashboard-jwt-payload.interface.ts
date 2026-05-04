/** JWT payload for dashboard access tokens (custom claims + registered claims). */
export interface DashboardAccessTokenPayload {
  sub: string;
  email: string;
  roleId: string;
  branchId: string | null;
  permissions: string[];
}
