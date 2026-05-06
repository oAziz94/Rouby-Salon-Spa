import { ForbiddenException } from '@nestjs/common';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';

export function canAccessAllBranches(user: DashboardJwtUser): boolean {
  return user.branchId === null || user.permissions.includes('branches.manage');
}

export function assertDashboardBranchAccess(
  user: DashboardJwtUser,
  branchId: string,
): void {
  if (canAccessAllBranches(user)) {
    return;
  }
  if (user.branchId !== branchId) {
    throw new ForbiddenException('Insufficient permissions');
  }
}

export function resolveDashboardBranchFilter(
  user: DashboardJwtUser,
  queryBranchId?: string,
): string | undefined {
  if (canAccessAllBranches(user)) {
    return queryBranchId;
  }
  return user.branchId ?? undefined;
}
