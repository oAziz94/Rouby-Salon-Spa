/** `req.user` after dashboard JWT validation. */
export interface DashboardJwtUser {
  userId: string;
  email: string;
  roleId: string;
  branchId: string | null;
  permissions: string[];
}
