/** `req.user` after dashboard JWT validation. */
export interface DashboardJwtUser {
  userId: string;
  email: string;
  roleId: string;
  /** Default / home branch for the user (DB column `users.branch_id`). */
  branchId: string | null;
  /** Allowed branch ids from `user_branch_access` (empty when unrestricted or legacy-only). */
  allowedBranchIds: string[];
  permissions: string[];
}
