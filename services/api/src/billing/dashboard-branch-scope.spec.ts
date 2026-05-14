import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  assertDashboardBranchAccess,
  buildDashboardBookingBranchWhere,
  getEffectiveAllowedBranchIds,
} from './dashboard-branch-scope';

describe('dashboard-branch-scope', () => {
  const unrestricted: DashboardJwtUser = {
    userId: 'u1',
    email: 'o@x.com',
    roleId: 'r1',
    branchId: null,
    allowedBranchIds: [],
    permissions: [],
  };

  const manager: DashboardJwtUser = {
    userId: 'u2',
    email: 'm@x.com',
    roleId: 'r2',
    branchId: 'b1',
    allowedBranchIds: ['b1', 'b2'],
    permissions: [],
  };

  const legacySingle: DashboardJwtUser = {
    userId: 'u3',
    email: 'l@x.com',
    roleId: 'r3',
    branchId: 'b9',
    allowedBranchIds: [],
    permissions: [],
  };

  it('treats null branch + no branches.manage as all-access', () => {
    expect(getEffectiveAllowedBranchIds(unrestricted)).toEqual([]);
  });

  it('uses allowedBranchIds when set', () => {
    expect(getEffectiveAllowedBranchIds(manager).sort()).toEqual([
      'b1',
      'b2',
    ]);
  });

  it('falls back to User.branchId when no access rows', () => {
    expect(getEffectiveAllowedBranchIds(legacySingle)).toEqual(['b9']);
  });

  it('buildDashboardBookingBranchWhere restricts to allowed set', () => {
    expect(buildDashboardBookingBranchWhere(manager)).toEqual({
      branchId: { in: ['b1', 'b2'] },
    });
    expect(buildDashboardBookingBranchWhere(manager, 'b1')).toEqual({
      branchId: 'b1',
    });
  });

  it('assertDashboardBranchAccess allows assigned branch', () => {
    expect(() =>
      assertDashboardBranchAccess(manager, 'b2'),
    ).not.toThrow();
  });

  it('assertDashboardBranchAccess rejects unassigned branch', () => {
    expect(() =>
      assertDashboardBranchAccess(manager, 'b99'),
    ).toThrow('Insufficient permissions');
  });
});
