import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';

/** Owner/Admin style: no branch row or branches.manage → all branches. */
export function canAccessAllBranches(user: DashboardJwtUser): boolean {
  return user.branchId === null || user.permissions.includes('branches.manage');
}

/**
 * Effective branch ids for a restricted dashboard user.
 * When `canAccessAllBranches` is true, returns [] (caller must not use this for filtering).
 *
 * TODO(multi-branch): Remove legacy fallback (empty join + User.branchId only) after
 * UserBranchAccess backfill is verified in production.
 */
export function getEffectiveAllowedBranchIds(
  user: DashboardJwtUser,
): string[] {
  if (canAccessAllBranches(user)) {
    return [];
  }
  if (user.allowedBranchIds.length > 0) {
    return user.allowedBranchIds;
  }
  if (user.branchId) {
    return [user.branchId];
  }
  return [];
}

export function assertDashboardBranchAccess(
  user: DashboardJwtUser,
  branchId: string,
): void {
  if (canAccessAllBranches(user)) {
    return;
  }
  const allowed = getEffectiveAllowedBranchIds(user);
  if (allowed.includes(branchId)) {
    return;
  }
  throw new ForbiddenException('Insufficient permissions');
}

/**
 * Branch filter for `Booking` / nested `booking.is` queries.
 * - All-access users: optional query-only filter.
 * - Restricted users: intersect with allowed set; multiple allowed branches use `in`.
 */
export function buildDashboardBookingBranchWhere(
  user: DashboardJwtUser,
  queryBranchId?: string,
): Prisma.BookingWhereInput {
  if (canAccessAllBranches(user)) {
    return queryBranchId ? { branchId: queryBranchId } : {};
  }
  const allowed = getEffectiveAllowedBranchIds(user);
  if (!allowed.length) {
    throw new ForbiddenException('Insufficient permissions');
  }
  if (queryBranchId) {
    if (!allowed.includes(queryBranchId)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return { branchId: queryBranchId };
  }
  if (allowed.length === 1) {
    return { branchId: allowed[0] };
  }
  return { branchId: { in: allowed } };
}

/**
 * Resolves a single branch id when operations require exactly one branch
 * (e.g. cash drawer session, daily closing). Returns undefined when ambiguous
 * (multi-branch user must pass `branchId` explicitly).
 */
export function resolveDashboardBranchFilter(
  user: DashboardJwtUser,
  queryBranchId?: string,
): string | undefined {
  if (canAccessAllBranches(user)) {
    return queryBranchId;
  }
  const w = buildDashboardBookingBranchWhere(user, queryBranchId);
  if (!w.branchId) {
    return undefined;
  }
  if (typeof w.branchId === 'string') {
    return w.branchId;
  }
  return queryBranchId;
}
